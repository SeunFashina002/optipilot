import { DEFAULT_HYPOTHESES_CAP, DEFAULT_MODEL } from "./constants";
import OpenAI from "openai";
import type { ThreadCreateParams } from "openai/resources/beta/index.mjs";
import type { ImageFileContentBlock } from "openai/resources/beta/threads/messages.mjs";
import { cluster } from "radash";
import { user } from "./message";
import { Prompt } from "./prompt";
import { dataUrlToFileInstance, isImage } from "./upload";
import { api } from "encore.dev/api";
import { secret } from "encore.dev/config";
import { StreamInOut } from "encore.dev/api";

export type MultiPageHypothesis = {
    title: string;
    description: string;
    pageContext?: string; // Which page(s) this hypothesis applies to
    journeyLevel?: boolean; // Whether this is a journey-level insight
};

export type PageScanData = {
    url: string;
    title: string;
    screenshots: string[];
    data?: any[];
};

type RecordProgress = (message?: string) => void;
type OnSetThreadId = (threadId?: string) => void;
type OnError = (error?: string) => void;

export class MultiPageHypothesesPrompt extends Prompt {
    private recordProgress: RecordProgress;
    private onSetThreadId: OnSetThreadId;
    private onError: OnError;
    private assistantID: string;
    private client: OpenAI;

    private pages: PageScanData[] = [];
    private goal?: string;
    private overview?: string;
    private details?: string;
    private _threadId?: string;
    private likedIdeas: MultiPageHypothesis[] = [];

    constructor(
        recordProgress: RecordProgress,
        onSetThreadId: OnSetThreadId,
        onError: OnError,
        assistantID: string,
        openAIAPIKey: string,
    ) {
        super();
        this.recordProgress = recordProgress;
        this.onSetThreadId = onSetThreadId;
        this.onError = onError;
        this.assistantID = assistantID;
        this.client = new OpenAI({
            apiKey: openAIAPIKey,
        });
    }

    get threadId() {
        return this._threadId;
    }

    set threadId(value) {
        this._threadId = value;
        this.onSetThreadId(value);
    }

    public withPages(pages: PageScanData[]) {
        this.pages = pages;
        return this;
    }

    public withGoal(value: string) {
        if (value) {
            this.goal = value;
        }
        return this;
    }

    public withDetails(value: string) {
        if (value) {
            this.details = value;
        }
        return this;
    }

    public withOverview(value: string) {
        if (value) {
            this.overview = value;
        }
        return this;
    }

    public withLikedIdeas(liked: MultiPageHypothesis[]) {
        this.likedIdeas = liked;
        return this;
    }

    private async createThread(): Promise<string> {
        const thread = await this.client.beta.threads.create();
        return thread.id;
    }

    private async messages(): Promise<ThreadCreateParams.Message[]> {
        const allMessages: ThreadCreateParams.Message[] = [];

        // Add context about the multi-page journey
        const contextMessage = user`I'm analyzing a multi-page user journey for optimization. Here's the context:

Goal: ${this.goal || "Not specified"}
Product Overview: ${this.overview || "Not specified"}
Additional Details: ${this.details || "Not specified"}

I'll be providing screenshots and data for ${this.pages.length} pages in this journey. Please analyze each page individually and then provide journey-level insights that consider the flow between pages.`;

        allMessages.push(contextMessage);

        // Process each page
        for (let i = 0; i < this.pages.length; i++) {
            const page = this.pages[i];
            this.recordProgress(
                `Processing page ${i + 1} of ${this.pages.length}`,
            );

            // Add page context
            const pageContextMessage = user`Page ${i + 1}: ${page.title} (${page.url})`;
            allMessages.push(pageContextMessage);

            // Process screenshots for this page
            if (page.screenshots.length > 0) {
                const fileIds = await Promise.all(
                    page.screenshots.map(async (screenshot) => {
                        const file = await dataUrlToFileInstance(screenshot);
                        this.recordProgress();

                        const response = await this.client.files.create({
                            file,
                            purpose: "vision",
                        });

                        this.recordProgress();
                        return response.id;
                    }),
                );

                const fileBatches: ImageFileContentBlock[][] = cluster(
                    fileIds.map((id) => ({
                        type: "image_file" as const,
                        image_file: {
                            file_id: id,
                        },
                    })),
                    10,
                );

                const keyPageAspects = [
                    "colors",
                    "appearance",
                    "contrast ratio",
                    "size",
                    "section responsibility",
                    "information density",
                    "cognitive load",
                    "all the elements inside",
                    "problems it currently has disturbing fulfilling its purpose (if any)",
                ];

                const screenshotMessage = user`Here are screenshots of Page ${i + 1}. Please list out all the section headings exactly as you see them, without modifying them. Per section please list all the features you see describe their ${keyPageAspects.join(", ")}. Don't hesitate to express your opinion describing ideas, like the hitherto version of a section sucks:`;

                allMessages.push(screenshotMessage);
                allMessages.push(
                    ...fileBatches.map((content) => ({
                        role: "user" as const,
                        content,
                    })),
                );
            }

            // Process data files for this page
            if (page.data && page.data.length > 0) {
                const fileIds = await Promise.all(
                    page.data.map(async (file) => {
                        this.recordProgress();

                        const response = await this.client.files.create({
                            file,
                            purpose: isImage(file) ? "vision" : "assistants",
                        });

                        this.recordProgress();
                        return { id: response.id, isImage: isImage(file) };
                    }),
                );

                const attachments: ThreadCreateParams.Message.Attachment[] =
                    fileIds
                        .filter(({ isImage }) => !isImage)
                        .map(({ id }) => ({
                            file_id: id,
                            tools: [{ type: "file_search" as const }],
                        }));

                if (attachments.length > 0) {
                    allMessages.push({
                        role: "user" as const,
                        content: "Additional data files for this page:",
                        attachments,
                    });
                }
            }
        }

        // Add instruction for journey analysis
        const journeyInstruction = user`Now that you've analyzed all ${this.pages.length} pages, please provide:

1. Page-specific hypotheses for each page (mark with "Page X:" prefix)
2. Journey-level hypotheses that consider the flow between pages (mark with "Journey:" prefix)
3. Cross-page optimization opportunities
4. User flow improvements

Focus on hypotheses that would improve the overall user journey and conversion flow.`;

        allMessages.push(journeyInstruction);

        return allMessages;
    }

    public async analyze(): Promise<MultiPageHypothesis[]> {
        console.log("MultiPageHypothesesPrompt.analyze() called");

        if (!this.threadId) {
            console.log("Creating new thread...");
            this.threadId = await this.createThread();
        }

        console.log("Thread ID:", this.threadId);
        this.recordProgress("Creating multi-page analysis thread");

        console.log("Creating messages...");
        const messages = await this.messages();
        console.log("Messages created, count:", messages.length);

        console.log("Adding user message to thread...");
        await this.client.beta.threads.messages.create(this.threadId, {
            role: "user",
            content:
                "Please analyze this multi-page journey and provide hypotheses.",
        });

        this.recordProgress("Analyzing multi-page journey");

        console.log("Starting OpenAI run...");
        const response = await this.client.beta.threads.runs.create(
            this.threadId,
            {
                model: this.model,
                assistant_id: this.assistantID,
                stream: true,
            },
        );

        this.recordProgress();
        let streams = 0;

        console.log("Processing stream...");
        for await (const message of response) {
            console.log(
                "Stream event:",
                message.event,
                JSON.stringify(message, null, 2),
            );
            if (!(++streams % 25)) this.recordProgress();

            if (message.event === "thread.message.completed") {
                console.log("Message completed, parsing hypotheses...");
                const content = (message.data.content[0] as any).text.value;
                const hypotheses = this.parseHypotheses(content);
                console.log("Parsed hypotheses count:", hypotheses.length);
                return hypotheses;
            }
        }

        console.log("No message completed, returning empty array");
        return [];
    }

    private parseHypotheses(content: string): MultiPageHypothesis[] {
        // Parse the AI response to extract hypotheses
        // This is a simplified parser - in production you'd want more robust parsing
        const lines = content.split("\n").filter((line) => line.trim());
        const hypotheses: MultiPageHypothesis[] = [];

        let currentHypothesis: Partial<MultiPageHypothesis> = {};

        for (const line of lines) {
            if (line.match(/^\d+\./)) {
                // New hypothesis
                if (currentHypothesis.title) {
                    hypotheses.push(currentHypothesis as MultiPageHypothesis);
                }
                currentHypothesis = {
                    title: line.replace(/^\d+\.\s*/, "").trim(),
                    description: "",
                };
            } else if (line.trim() && currentHypothesis.title) {
                // Description line
                currentHypothesis.description +=
                    (currentHypothesis.description ? " " : "") + line.trim();
            }
        }

        // Add the last hypothesis
        if (currentHypothesis.title) {
            hypotheses.push(currentHypothesis as MultiPageHypothesis);
        }

        return hypotheses.slice(0, this.cap);
    }

    public async sendFeedback(
        message?: string,
    ): Promise<MultiPageHypothesis[]> {
        if (!this.threadId) {
            throw new Error("Thread ID is required");
        }
        this.recordProgress();

        let likedIdeasMessage = "";
        if (this.likedIdeas && this.likedIdeas.length > 0) {
            likedIdeasMessage =
                "Here are some ideas the user liked previously:\n" +
                this.likedIdeas
                    .map(
                        (idea, index) =>
                            `${index + 1}. ${idea.title}: ${idea.description}`,
                    )
                    .join("\n") +
                "\nPlease generate new ideas inspired by these.";
        }

        const response = await this.client.beta.threads.runs.create(
            this.threadId,
            {
                model: this.model,
                assistant_id: this.assistantID,
                additional_messages: [
                    user`Now please return new multi-page hypotheses based on feedback provided below. Change only the ones that my feedback pertains to. Leave others intact but still return them in the same order as before.\n\nFeedback:\n${message}\n${likedIdeasMessage}\nOPTIPILOT!`,
                ],
                stream: true,
            },
        );

        this.recordProgress();
        let streams = 0;

        for await (const message of response) {
            if (!(++streams % 25)) this.recordProgress();

            if (message.event === "thread.message.completed") {
                const content = (message.data.content[0] as any).text.value;
                return this.parseHypotheses(content);
            }
        }

        return [];
    }

    private get model() {
        return DEFAULT_MODEL;
    }

    private get cap() {
        return DEFAULT_HYPOTHESES_CAP;
    }
}

// API endpoint for multi-page hypotheses generation
interface MultiPageHypothesesRequest {
    goal: string;
    overview: string;
    details: string;
    pages: PageScanData[];
    likedIdeas?: MultiPageHypothesis[];
}

interface MultiPageHypothesesResponse {
    hypotheses?: MultiPageHypothesis[];
    message?: string;
    threadId?: string;
    error?: string;
}

const openaiApiKey = secret("OpenAIAPIKey");
const assistantId = secret("AssistantID");

export const generateMultiPageHypotheses = api.streamInOut<
    MultiPageHypothesesRequest,
    MultiPageHypothesesResponse
>(
    { expose: true },
    async (
        stream: StreamInOut<
            MultiPageHypothesesRequest,
            MultiPageHypothesesResponse
        >,
    ) => {
        console.log("Multi-page hypotheses endpoint called");

        const prompt = new MultiPageHypothesesPrompt(
            (message) => {
                console.log("Progress message:", message);
                stream.send({ message: message ?? "" });
            },
            (value) => {
                console.log("Thread ID set:", value);
                stream.send({ threadId: value });
            },
            (error) => {
                console.error("Error in multi-page prompt:", error);
                stream.send({ error: error ?? "" });
                stream.close();
            },
            assistantId(),
            openaiApiKey(),
        );

        for await (const request of stream) {
            const handshake = request as MultiPageHypothesesRequest;
            console.log("Received multi-page request:", {
                goal: handshake.goal,
                overview: handshake.overview,
                details: handshake.details,
                pagesCount: handshake.pages.length,
                pages: handshake.pages.map((p) => ({
                    url: p.url,
                    title: p.title,
                    screenshotsCount: p.screenshots.length,
                })),
            });

            // Process page data
            const processedPages = await Promise.all(
                handshake.pages.map(async (page) => ({
                    ...page,
                    data: page.data
                        ? await Promise.all(
                              page.data.map((dataUrl) =>
                                  dataUrlToFileInstance(dataUrl),
                              ),
                          )
                        : undefined,
                })),
            );

            console.log("Processed pages:", processedPages.length);

            prompt
                .withGoal(handshake.goal)
                .withOverview(handshake.overview)
                .withDetails(handshake.details)
                .withPages(processedPages);

            if (handshake.likedIdeas) {
                prompt.withLikedIdeas(handshake.likedIdeas);
            }
            break;
        }

        console.log("Starting analysis...");
        const hypotheses = await prompt.analyze();
        console.log("Analysis complete, hypotheses count:", hypotheses.length);

        await stream.send({ hypotheses });
        await stream.close();
    },
);

interface MultiPageHypothesesFeedbackRequest {
    threadId: string;
    message: string;
    likedIdeas?: MultiPageHypothesis[];
}

interface MultiPageHypothesesFeedbackResponse {
    hypotheses?: MultiPageHypothesis[];
    message?: string;
    error?: string;
}

export const sendMultiPageFeedback = api.streamInOut<
    MultiPageHypothesesFeedbackRequest,
    MultiPageHypothesesFeedbackResponse
>(
    { expose: true },
    async (
        stream: StreamInOut<
            MultiPageHypothesesFeedbackRequest,
            MultiPageHypothesesFeedbackResponse
        >,
    ) => {
        const prompt = new MultiPageHypothesesPrompt(
            (message) => {
                stream.send({ message: message ?? "" });
            },
            () => {}, // No thread ID setting needed for feedback
            (error) => {
                stream.send({ error: error ?? "" });
                stream.close();
            },
            assistantId(),
            openaiApiKey(),
        );

        let handshake: MultiPageHypothesesFeedbackRequest | undefined;
        for await (const request of stream) {
            handshake = request as MultiPageHypothesesFeedbackRequest;

            prompt.threadId = handshake.threadId;

            if (handshake.likedIdeas) {
                prompt.withLikedIdeas(handshake.likedIdeas);
            }
            break;
        }

        if (!handshake) throw new Error("No handshake received");
        const hypotheses = await prompt.sendFeedback(handshake.message);

        await stream.send({ hypotheses });
        await stream.close();
    },
);

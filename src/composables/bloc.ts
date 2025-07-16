import { BusinessInfoPrompt } from "@/bloc/business-info-prompt.ts";
import { HypothesesPrompt, Hypothesis } from "@/bloc/hypotheses-prompt";
import { ScanTitlePrompt } from "@/bloc/scan-title-prompt";
import { dataUrlToFileInstance, fileToDataUrl } from "@/bloc/upload";
import { BREAKPOINTS, DEVICE_TYPE_OPTIONS, DeviceType } from "@/constants";
import { Body, Meta, UppyFile } from "@uppy/core";
import useVuelidate from "@vuelidate/core";
import { required } from "@vuelidate/validators";
import { useStorage } from "@vueuse/core";
import Client from "@/composables/client";
import { multiPageScan } from "@/composables/multiPageScan";

function fields(tab: MaybeRefOrGetter<chrome.tabs.Tab>) {
    const { domain } = useTab(tab);

    function key(value: TemplateStringsArray) {
        return `${domain.value ?? ``}.${value[0]}`;
    }

    const product = {
        overview: useStorage(key`product.overview`, ``),
        details: useStorage(key`product.details`, ``),
        data: useStorage(key`product.data`, []),
    };

    const scan = {
        objective: useStorage(key`scan.objective`, ``),
        overview: useStorage(key`scan.overview`, ``),
        data: useStorageAsync(key`scan.data`, [], undefined, {
            serializer: {
                async read(value: string) {
                    const deserialized: UppyFile<Meta, Body> &
                        { data: string }[] = JSON.parse(value);

                    const files = await Promise.all(
                        deserialized.map((item) =>
                            dataUrlToFileInstance(item.data),
                        ),
                    );

                    return deserialized.map((item, index) => ({
                        ...item,
                        data: files[index],
                    }));
                },
                async write(data: UppyFile<Meta, Body>[]) {
                    const files = await Promise.all(
                        data.map((item) => fileToDataUrl(item.data as File)),
                    );

                    return JSON.stringify(
                        data.map((item, index) => ({
                            ...item,
                            data: files[index],
                        })),
                    );
                },
            },
        }),
        deviceType: useStorage<DeviceType>(key`scan.deviceType`, `desktop`),
        mode: useStorage<"single" | "multi">(key`scan.mode`, `single`),
        urlList: useStorage(key`scan.urlList`, ``),
    };

    const feedback = {
        message: ref(``),
    };

    const screenshotsToTake = ref(1);

    return {
        product: {
            ...product,
            $validation: useVuelidate(
                {
                    overview: { required },
                    details: {},
                    data: {},
                },
                product,
            ),
        },

        scan: {
            ...scan,
            $validation: useVuelidate(
                {
                    objective: { required },
                    data: {},
                    deviceType: {
                        required,
                        oneOf(value: string) {
                            // @ts-expect-error — `includes` typing too strict.
                            return DEVICE_TYPE_OPTIONS.map(
                                ({ slug }) => slug,
                            ).includes(value);
                        },
                    },
                },
                scan,
            ),
        },

        feedback: {
            ...feedback,
            $validation: useVuelidate(
                {
                    message: { required },
                },
                feedback,
            ),
        },

        progress: {
            step: 1,
            message: ref(``),
            numerator: ref(0),
            denominator: computed(() =>
                Math.min(250, screenshotsToTake.value * 75),
            ),

            tick(message?: string) {
                const { numerator, denominator } = bloc.progress;
                if (numerator >= denominator - 2) {
                    bloc.progress.step *= 0.6;
                    bloc.progress.numerator += bloc.progress.step;
                } else {
                    bloc.progress.numerator = Math.min(
                        numerator + bloc.progress.step,
                        denominator - 2,
                    );
                }

                if (message) bloc.progress.message = message;
            },

            finish() {
                bloc.progress.numerator = bloc.progress.denominator;
            },

            reset(message: string) {
                bloc.progress.step = 1;
                bloc.progress.message = message;
                bloc.progress.numerator = 0;
            },
        },

        screenshots: ref<string[]>([]),

        takeScreenshots(currentTab: chrome.tabs.Tab) {
            type State = {
                top: number;
                step: number;
                pageHeight: number;
            };

            return new Promise<void>((resolve) => {
                function takeScreenshot(first = false) {
                    if (first) bloc.screenshots = [];

                    chrome.scripting.executeScript<
                        [first: boolean],
                        Promise<State>
                    >(
                        {
                            target: { tabId: currentTab.id! },
                            func: async (first) => {
                                const top = first
                                    ? 0
                                    : window.scrollY + window.innerHeight;

                                window.scrollTo(0, top);
                                await new Promise((resolve) =>
                                    setTimeout(resolve, 500),
                                );

                                return {
                                    top,
                                    step: window.innerHeight,
                                    pageHeight: document.body.scrollHeight,
                                };
                            },
                            args: [first],
                        },
                        async (injectionResults) => {
                            const { top, step, pageHeight } =
                                injectionResults[0].result as State;

                            if (first) {
                                screenshotsToTake.value = Math.ceil(
                                    pageHeight / step,
                                );
                            }

                            if (chrome.runtime.lastError) {
                                console.error(chrome.runtime.lastError.message);
                                return;
                            }

                            const screenshot =
                                await chrome.tabs.captureVisibleTab();

                            bloc.screenshots.push(screenshot);
                            bloc.progress.tick();

                            if (top + step < pageHeight) {
                                takeScreenshot();
                            } else resolve();
                        },
                    );
                }

                takeScreenshot(true);
            });
        },

        prompt: new HypothesesPrompt(
            (message?: string) => bloc.progress.tick(message),
            (value?: string) => (bloc.threadId = value),
            () => {
                bloc.backendErrorOccured = true;
                bloc.progress.finish();
            },
        ),

        businessInfoPrompt: new BusinessInfoPrompt(domain.value ?? ``),

        threadId: useStorage(key`threadId`, ``),

        scanId: ref<string>(``),

        scanIds: useStorage(`_scans`, []),

        pending: ref(false),

        businessDetailsPending: ref(false),

        backendErrorOccured: ref(false),

        resetError: () => {
            bloc.backendErrorOccured = false;
            bloc.pending = false;
        },

        // Persistent Map for liked hypotheses (by title)
        likedHypotheses: useStorage<Map<string, boolean>>(
            `liked.hypotheses`,
            new Map(),
            localStorage,
            {
                serializer: {
                    read: (v) => new Map(JSON.parse(v || `[]`)),
                    write: (v) => JSON.stringify([...v.entries()]),
                },
            },
        ),

        async submit() {
            if (bloc.scan.mode === "multi") {
                await bloc.submitMultiPage();
            } else {
                await bloc.submitSinglePage();
            }
        },

        async submitSinglePage() {
            bloc.pending = true;
            bloc.progress.reset(`Gathering screenshots`);

            const currentTab = toValue(tab);

            resizeCurrentTab(
                BREAKPOINTS[bloc.scan.deviceType as keyof typeof BREAKPOINTS](),
                window.screen.availHeight,
            );

            await bloc.takeScreenshots(currentTab);

            bloc.progress.tick();

            // Gather liked hypotheses
            const likedMap =
                bloc.likedHypotheses.value instanceof Map
                    ? bloc.likedHypotheses.value
                    : new Map();
            const likedHypothesesList = (bloc.hypotheses || []).filter(
                (h: Hypothesis) => likedMap.get(h.title),
            );

            bloc.prompt
                .withScreenshots(bloc.screenshots)
                .withData(
                    bloc.scan.data.map(({ data }: { data: File[] }) => data),
                )
                .withGoal(bloc.scan.objective)
                .withOverview(bloc.product.overview)
                .withDetails(bloc.product.details)
                .withLikedIdeas(likedHypothesesList);

            bloc.progress.tick();

            const results = await bloc.prompt.request();

            if (bloc.backendErrorOccured) {
                return;
            }

            bloc.progress.finish();

            const scanId = crypto.randomUUID();
            bloc.scanIds = [...bloc.scanIds, scanId];

            const scan = useScanById(scanId, {
                id: scanId,
                threadId: bloc.threadId,
                title: ``,
                date: new Date(),
                icon: toValue(tab).favIconUrl,
                hypotheses: results,
            });

            bloc.scanId = scanId;

            setTimeout(() => {
                // Merge in liked hypotheses not in results
                bloc.hypotheses = mergeLikedHypotheses(results);
                bloc.pending = false;
            }, 300);

            new ScanTitlePrompt(bloc.threadId).request().then((title) => {
                scan.value!.title = title;
            });
        },

        async submitMultiPage() {
            bloc.pending = true;
            bloc.progress.reset(`Starting multi-page journey scan`);

            const urls = bloc.scan.urlList
                .split("\n")
                .map((url: string) => url.trim())
                .filter(Boolean);

            if (urls.length === 0) {
                bloc.onError("No valid URLs provided for multi-page scan");
                return;
            }

            bloc.progress.tick(`Preparing to scan ${urls.length} pages`);

            // Use the multi-page scan function
            try {
                bloc.progress.tick(
                    `Navigating to pages and capturing screenshots`,
                );

                const currentTab = toValue(tab);
                if (!currentTab.id) {
                    throw new Error("No active tab found");
                }

                const scanResults = await multiPageScan(urls, {
                    tabId: currentTab.id,
                    onProgress: (info) => {
                        bloc.progress.tick(
                            `Scanning page ${info.index}/${info.total}: ${info.url}`,
                        );
                    },
                    delayMs: 1000,
                });

                // Convert scan results to the format expected by the backend
                const pages = scanResults.map((result, index) => ({
                    url: result.url,
                    title: `Page ${index + 1}`,
                    screenshots: result.screenshots,
                    data: [],
                }));

                console.log("Multi-page scan results:", scanResults);
                console.log("Pages data being sent to backend:", pages);

                bloc.progress.tick(`Analyzing multi-page journey`);

                // Gather liked hypotheses
                const likedMap =
                    bloc.likedHypotheses.value instanceof Map
                        ? bloc.likedHypotheses.value
                        : new Map();
                const likedHypothesesList = (bloc.hypotheses || []).filter(
                    (h: Hypothesis) => likedMap.get(h.title),
                );

                bloc.progress.tick(`Analyzing multi-page journey`);

                // Use the new multi-page client
                const client = new Client(
                    import.meta.env.VITE_API_SERVER_URL ||
                        "http://localhost:4000",
                );
                const stream =
                    await client.prompt.generateMultiPageHypotheses();

                const analyzePayload: any = {
                    goal: bloc.scan.objective || "",
                    overview: bloc.product.overview || "",
                    details: bloc.product.details || "",
                    pages,
                };

                if (likedHypothesesList.length > 0) {
                    analyzePayload.likedIdeas = likedHypothesesList;
                }

                console.log("Analyze payload being sent:", analyzePayload);

                await stream.send(analyzePayload);

                let hypotheses: any[] = [];
                for await (const response of stream) {
                    console.log("Received response from backend:", response);

                    if (response.hypotheses) {
                        hypotheses = response.hypotheses;
                        console.log("Received hypotheses:", hypotheses);
                    }
                    if (response.threadId) {
                        bloc.threadId = response.threadId;
                        console.log("Received thread ID:", response.threadId);
                    }
                    if (response.error) {
                        console.error("Backend error:", response.error);
                        bloc.onError();
                    }
                    if (
                        Object.prototype.hasOwnProperty.call(
                            response,
                            "message",
                        )
                    ) {
                        bloc.progress.tick(response.message);
                    }
                }

                if (bloc.backendErrorOccured) {
                    return;
                }

                bloc.progress.finish();

                const scanId = crypto.randomUUID();
                bloc.scanIds = [...bloc.scanIds, scanId];

                const scan = useScanById(scanId, {
                    id: scanId,
                    threadId: bloc.threadId,
                    title: `Multi-page Journey`,
                    date: new Date(),
                    icon: toValue(tab).favIconUrl,
                    hypotheses: hypotheses,
                });

                bloc.scanId = scanId;

                setTimeout(() => {
                    bloc.hypotheses = hypotheses;
                    bloc.pending = false;
                }, 300);
            } catch (error) {
                console.error("Multi-page scan error:", error);
                bloc.onError(
                    `Failed to scan pages: ${error instanceof Error ? error.message : "Unknown error"}`,
                );
                bloc.pending = false;
            }
        },

        async submitFeedback(scanId?: string) {
            const scan = scanId ? useScanById(scanId) : undefined;

            bloc.pending = true;
            bloc.progress.reset(`Gathering feedback`);

            // Gather liked hypotheses
            const likedMap =
                bloc.likedHypotheses.value instanceof Map
                    ? bloc.likedHypotheses.value
                    : new Map();
            const likedHypothesesList = (bloc.hypotheses || []).filter(
                (h: Hypothesis) => likedMap.get(h.title),
            );

            bloc.prompt.withLikedIdeas(likedHypothesesList);

            const results = await bloc.prompt.request(
                bloc.feedback.message,
                scan?.value?.threadId || bloc.threadId,
            );

            if (bloc.backendErrorOccured) {
                return;
            }

            bloc.progress.finish();

            if (scan?.value) {
                scan.value.hypotheses = results;
                bloc.scanId = scanId;
            }

            bloc.hypotheses = mergeLikedHypotheses(results);
            bloc.pending = false;
        },

        hypotheses: useStorage<Hypothesis[]>(key`hypotheses`, []),

        hostFavicon: computed(() => toValue(tab).favIconUrl),
        tab: useStorage(key`tab`, `website`),
    };
}

// @ts-ignore
const bloc = reactive(
    Object.assign({} as ReturnType<typeof fields>, {
        ready: ref(false),
    }),
);

export function defineBloc() {
    provide(`bloc`, bloc);
    return bloc;
}

function isValidUrl(url?: string): boolean {
    if (!url) return false;

    try {
        const parsedUrl = new URL(url);

        const invalidProtocols = [`chrome:`, `about:`, `file:`];
        if (
            invalidProtocols.some((protocol) =>
                parsedUrl.protocol.startsWith(protocol),
            )
        ) {
            return false;
        }

        const invalidHosts = [`newtab`, `settings`, `extensions`];
        return !invalidHosts.some((host) => parsedUrl.hostname.includes(host));
    } catch {
        return false;
    }
}

export function initBloc(tab: MaybeRefOrGetter<chrome.tabs.Tab>) {
    Object.assign(bloc, fields(tab));

    if (bloc.product.overview === `` && isValidUrl(toValue(tab).url)) {
        bloc.businessDetailsPending = true;
        bloc.businessInfoPrompt.request().then((text: string | undefined) => {
            if (!bloc.businessDetailsPending) {
                return;
            }

            bloc.product.overview = text;
            bloc.businessDetailsPending = false;
        });
    }
    bloc.ready = true;

    return bloc;
}

type Bloc = ReturnType<typeof initBloc>;

export function useBloc() {
    return inject(`bloc`) as Bloc;
}

function resizeCurrentTab(width: number, height: number) {
    return new Promise<void>((resolve) => {
        chrome.windows.getCurrent(async function (window) {
            const updateInfo: chrome.windows.UpdateInfo = {
                width,
                height,
                top: 0,
                left: 0,
                focused: false,
            };

            await chrome.windows.update(window.id!, updateInfo);
            // HACK: Reapplying in case the window is initially in fullscreen mode.
            await chrome.windows.update(window.id!, updateInfo);

            resolve();
        });
    });
}

function mergeLikedHypotheses(results: Hypothesis[]): Hypothesis[] {
    const likedHypothesesData = JSON.parse(
        localStorage.getItem(`liked.hypotheses`) || `[]`,
    ) as [string, boolean][];

    const missingLiked: Hypothesis[] = [];

    for (const [title, isLiked] of likedHypothesesData) {
        if (!isLiked) continue;

        const isInResults = results.some(
            (hypothesis: Hypothesis) => hypothesis.title === title,
        );
        if (isInResults) continue;

        const previous = (bloc.hypotheses || []).find(
            (hypothesis: Hypothesis) => hypothesis.title === title,
        );

        if (previous) {
            missingLiked.push(previous);
        } else {
            missingLiked.push({
                title,
                description: `(Previously liked idea)`,
            });
        }
    }

    return [...results, ...missingLiked];
}

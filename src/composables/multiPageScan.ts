import { ref } from "vue";

export interface MultiPageScanResult {
    url: string;
    screenshots: string[];
}

export interface MultiPageScanOptions {
    tabId: number;
    onProgress?: (info: {
        url: string;
        index: number;
        total: number;
        screenshotIndex?: number;
        screenshotCount?: number;
    }) => void;
    delayMs?: number;
}

// Helper to scroll and capture all screenshots for a page
async function captureFullPageScreenshots(
    tabId: number,
    onProgress?: (info: {
        screenshotIndex: number;
        screenshotCount: number;
    }) => void,
): Promise<string[]> {
    const { pageHeight, viewportHeight } = await new Promise<{
        pageHeight: number;
        viewportHeight: number;
    }>((resolve, reject) => {
        chrome.scripting.executeScript(
            {
                target: { tabId },
                func: () => ({
                    pageHeight: document.body.scrollHeight,
                    viewportHeight: window.innerHeight,
                }),
            },
            (results) => {
                if (chrome.runtime.lastError || !results || !results[0])
                    return reject(chrome.runtime.lastError);
                resolve(results[0].result);
            },
        );
    });

    const screenshotCount = Math.ceil(pageHeight / viewportHeight);
    const screenshots: string[] = [];

    console.log(
        `Page height: ${pageHeight}, viewport height: ${viewportHeight}, screenshot count: ${screenshotCount}`,
    );

    for (let i = 0; i < screenshotCount; i++) {
        // Scroll to position
        await new Promise<void>((resolve, reject) => {
            chrome.scripting.executeScript(
                {
                    target: { tabId },
                    func: (index, viewportHeight) => {
                        window.scrollTo(0, index * viewportHeight);
                        return true;
                    },
                    args: [i, viewportHeight],
                },
                () => {
                    setTimeout(resolve, 500); // Wait for scroll/render
                },
            );
        });

        // Capture screenshot
        const screenshot = await new Promise<string>((resolve, reject) => {
            chrome.tabs.captureVisibleTab(
                undefined,
                { format: "png" },
                (dataUrl) => {
                    if (chrome.runtime.lastError || !dataUrl)
                        return reject(chrome.runtime.lastError);
                    resolve(dataUrl);
                },
            );
        });
        screenshots.push(screenshot);
        if (onProgress) onProgress({ screenshotIndex: i + 1, screenshotCount });
    }
    return screenshots;
}

export async function multiPageScan(
    urls: string[],
    options: MultiPageScanOptions,
): Promise<MultiPageScanResult[]> {
    const results: MultiPageScanResult[] = [];
    const { tabId, onProgress, delayMs = 1000 } = options;

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        if (onProgress) onProgress({ url, index: i + 1, total: urls.length });

        try {
            // Navigate to the URL
            await new Promise<void>((resolve, reject) => {
                chrome.tabs.update(tabId, { url }, () => {
                    if (chrome.runtime.lastError)
                        return reject(chrome.runtime.lastError);
                    resolve();
                });
            });

            // Wait for the page to finish loading
            await new Promise<void>((resolve) => {
                function handleUpdated(
                    updatedTabId: number,
                    info: chrome.tabs.TabChangeInfo,
                ) {
                    if (updatedTabId === tabId && info.status === "complete") {
                        chrome.tabs.onUpdated.removeListener(handleUpdated);
                        setTimeout(resolve, 500); // Give a little extra time for rendering
                    }
                }
                chrome.tabs.onUpdated.addListener(handleUpdated);
            });

            // Capture all screenshots for this page
            const screenshots = await captureFullPageScreenshots(
                tabId,
                (info) => {
                    if (onProgress)
                        onProgress({
                            url,
                            index: i + 1,
                            total: urls.length,
                            ...info,
                        });
                },
            );

            console.log(
                `Completed scanning ${url}. Screenshots captured: ${screenshots.length}`,
            );
            results.push({ url, screenshots });
        } catch (err) {
            // Skip this page on error
            results.push({ url, screenshots: [] });
        }

        // Optional delay between scans
        if (i < urls.length - 1 && delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    return results;
}

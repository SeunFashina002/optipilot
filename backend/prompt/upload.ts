import mime from "mime";
import { Readable } from "stream";

export async function dataUrlToFileInstance(dataUrl: string): Promise<File> {
    return new Promise((resolve) => {
        const array = dataUrl.split(",");
        const type = array[0]?.match(/:(.*?);/)?.[1];
        const extension = mime.getExtension(type!);
        const bstr = atob(array[1]);
        let n = bstr.length;
        const u8array = new Uint8Array(n);

        while (n--) {
            // eslint-disable-next-line unicorn/prefer-code-point
            u8array[n] = bstr.charCodeAt(n);
        }

        // Create a Node.js file-like object that OpenAI can work with
        const file = {
            name: `file.${extension}`,
            type: type,
            size: u8array.length,
            stream: () => Readable.from(u8array),
            arrayBuffer: () => Promise.resolve(u8array.buffer),
            slice: (start: number, end: number) => {
                const sliced = u8array.slice(start, end);
                return {
                    name: `file.${extension}`,
                    type: type,
                    size: sliced.length,
                    stream: () => Readable.from(sliced),
                    arrayBuffer: () => Promise.resolve(sliced.buffer),
                };
            },
        };

        resolve(file);
    });
}

export function isImage(file: any) {
    return file.type && file.type.match("image/");
}

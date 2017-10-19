export default class Utils {

    public static async fetchContentAsAny(url: string, responseType: XMLHttpRequestResponseType): Promise<any> {
        return new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.responseType = responseType;

            xhr.onreadystatechange = () => {
                if (xhr.readyState !== 4) { return; }
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(xhr.response);
                } else {
                    reject(xhr.statusText);
                }
            };

            xhr.send();
        });
    }

    public static async fetchContentAsText(url: string): Promise<string> {
        return Utils.fetchContentAsAny(url, "text");
    }

    public static async fetchContentAsArrayBuffer(url: string): Promise<ArrayBuffer> {
        return Utils.fetchContentAsAny(url, "arraybuffer");
    }

    public static isAbsoluteUrl(url: string): boolean {
        return url.startsWith("http://") || url.startsWith("https://");
    }

}

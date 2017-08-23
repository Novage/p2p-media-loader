export default class Utils {

    public static async fetchContent(url: string, responseType: XMLHttpRequestResponseType = ""): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.responseType = responseType;

            xhr.onreadystatechange = () => {
                if (xhr.readyState !== 4) { return; }
                if (xhr.status >= 200 && xhr.status < 300) {
                    if (xhr.responseType === "arraybuffer") {
                        resolve(xhr.response);
                    } else {
                        resolve(xhr.responseText);
                    }
                } else {
                    reject(xhr.statusText);
                }
            };

            xhr.send();
        });
    }

    public static isAbsoluteUrl(url: string): boolean {
        return url.startsWith("http://") || url.startsWith("https://");
    }

}

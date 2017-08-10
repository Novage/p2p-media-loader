export default class Utils {

    public static async fetchContent(url: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = () => {
                if (xhr.readyState !== 4) { return; }
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(xhr.responseText);
                } else {
                    reject(xhr.statusText);
                }
            };
            xhr.open("GET", url, true);
            xhr.send();
        });
    }

    public static isAbsoluteUrl(url: string): boolean {
        return url.startsWith("http://") || url.startsWith("https://");
    }

}

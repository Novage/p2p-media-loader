/**
 * Copyright 2018 Novage LLC.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export default class Utils {

    public static async fetchContentAsAny(url: string, range: string | undefined, responseType: XMLHttpRequestResponseType): Promise<any> {
        return new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", url, true);
            xhr.responseType = responseType;

            if (range !== undefined) {
                xhr.setRequestHeader("Range", range);
            }

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
        return Utils.fetchContentAsAny(url, undefined, "text");
    }

    public static async fetchContentAsArrayBuffer(url: string, range: string | undefined): Promise<ArrayBuffer> {
        return Utils.fetchContentAsAny(url, range, "arraybuffer");
    }

}

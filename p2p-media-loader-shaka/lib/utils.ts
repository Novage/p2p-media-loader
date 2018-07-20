export function getSchemedUri(uri: string) {
    return uri.startsWith("//") ? window.location.protocol + uri : uri;
}

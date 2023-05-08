export class HybridLoader {
  static isSupported() {
    console.log("isSupported");
    return false;
  }

  static text() {
    return "Text";
  }
}

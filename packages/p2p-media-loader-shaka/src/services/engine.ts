export class Engine {
  static isSupported() {
    return true;
  }

  static getText(): string {
    return "Some stupid text with no sense.";
  }

  getSettings() {
    return { opt1: 1, opt2: 2 };
  }

  createLoaderClass() {
    return { name: "loader class" };
  }
}

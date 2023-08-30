export class Playback {
  private _rate = 1;
  private _position = 0;
  private _highDemandMargin = 0;
  private _httpDownloadMargin = 0;
  private _p2pDownloadMargin = 0;
  private onUpdateSubscriptions: (() => void)[] = [];

  constructor(
    private readonly settings: {
      readonly highDemandBufferLength: number;
      readonly httpDownloadBufferLength: number;
      readonly p2pDownloadBufferLength: number;
    }
  ) {
    this.updateMargins();
  }

  set position(value: number) {
    if (value === this._position) return;
    this._position = value;
    this.updateMargins();
    this.onUpdateSubscriptions.forEach((s) => s());
  }

  get position() {
    return this._position;
  }

  set rate(value: number) {
    if (value === this._rate) return;
    this._rate = value;
    this.updateMargins();
    this.onUpdateSubscriptions.forEach((s) => s());
  }

  get highDemandMargin() {
    return this._highDemandMargin;
  }

  get httpDownloadMargin() {
    return this._httpDownloadMargin;
  }

  get p2pDownloadMargin() {
    return this._p2pDownloadMargin;
  }

  private updateMargins() {
    const {
      highDemandBufferLength,
      httpDownloadBufferLength,
      p2pDownloadBufferLength,
    } = this.settings;
    this._highDemandMargin =
      this._position + highDemandBufferLength * this._rate;
    this._httpDownloadMargin =
      this._position + httpDownloadBufferLength * this._rate;
    this._p2pDownloadMargin =
      this._position + p2pDownloadBufferLength * this._rate;
  }

  getTimeTo(time: number) {
    return (time - this._position) / this._rate;
  }

  subscribeToUpdate(handler: () => void) {
    this.onUpdateSubscriptions.push(handler);
  }
}

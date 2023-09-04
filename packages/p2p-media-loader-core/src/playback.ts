export class Playback {
  private _position?: number;
  private _rate = 1;
  private _highDemandMargin?: number;
  private _httpMargin?: number;
  private _p2pMargin?: number;

  constructor(
    private readonly settings: {
      highDemandBufferLength: number;
      httpBufferLength: number;
      p2pBufferLength: number;
    }
  ) {
    this.updateMargins();
  }

  isInitialized() {
    return this._position !== undefined;
  }

  set position(value: number) {
    if (this._position === value) return;
    this._position = value;
    this.updateMargins();
  }

  get position() {
    return this._position ?? 0;
  }

  set rate(value: number) {
    if (this._rate === value) return;
    this._rate = value;
    this.updateMargins();
  }

  get rate() {
    return this._rate ?? 0;
  }

  private updateMargins() {
    if (this._position === undefined || this._rate === undefined) return;

    const { highDemandBufferLength, httpBufferLength, p2pBufferLength } =
      this.settings;
    this._highDemandMargin =
      this._position + highDemandBufferLength * this._rate;
    this._httpMargin = this._position + httpBufferLength * this._rate;
    this._p2pMargin = this._position + p2pBufferLength * this._rate;
  }

  get margins() {
    return {
      highDemand: this._highDemandMargin ?? 0,
      http: this._httpMargin ?? 0,
      p2p: this._p2pMargin ?? 0,
    };
  }
}

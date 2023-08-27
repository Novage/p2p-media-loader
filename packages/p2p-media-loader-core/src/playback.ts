export class Playback {
  private _rate = 0;
  private _position = 0;
  private readonly settings: {
    readonly highDemandBufferLength: number;
    readonly lowDemandBufferLength: number;
  };
  private _highDemandMargin: number = 0;
  private _lowDemandMargin: number = 0;

  constructor(settings: {
    readonly highDemandBufferLength: number;
    readonly lowDemandBufferLength: number;
  }) {
    this.settings = settings;
  }

  set position(value: number) {
    this._position = value;
    this._highDemandMargin = this.getHighDemandMargin();
    this._lowDemandMargin = this.getLowDemandMargin();
  }

  get position() {
    return this._position;
  }

  set rate(value: number) {
    this._rate = value;
    this._highDemandMargin = this.getHighDemandMargin();
    this._lowDemandMargin = this.getLowDemandMargin();
  }

  get rate() {
    return this._rate;
  }

  get highDemandMargin() {
    return this._highDemandMargin;
  }

  get lowDemandMargin() {
    return this._lowDemandMargin;
  }

  private getHighDemandMargin() {
    const { highDemandBufferLength } = this.settings;
    return this._position + highDemandBufferLength * this._rate;
  }

  private getLowDemandMargin() {
    const { lowDemandBufferLength } = this.settings;
    return this._position + lowDemandBufferLength * this._rate;
  }

  getTimeTo(time: number) {
    return (time - this._position) / this._rate;
  }
}

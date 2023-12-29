type LinkedObject<K, V extends object> = {
  item: [K, V];
  prev?: LinkedObject<K, V>;
  next?: LinkedObject<K, V>;
};

export class LinkedMap<K, V extends object> {
  private readonly map = new Map<K, LinkedObject<K, V>>();
  private _first?: LinkedObject<K, V>;
  private _last?: LinkedObject<K, V>;

  get size() {
    return this.map.size;
  }

  get(key: K): V | undefined {
    return this.map.get(key)?.item[1];
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  addToEnd(key: K, value: V) {
    const item: LinkedObject<K, V> = { item: [key, value] };
    if (this._last) {
      this._last.next = item;
      item.prev = this._last;
    }
    this._last = item;
    if (!this._first) this._first = item;
    this.map.set(key, item);
  }

  delete(key: K) {
    if (!this.map.size) return;
    const value = this.map.get(key);
    if (!value) return;

    const { next, prev } = value;
    if (this._first?.item[0] === key) this._first = next;
    if (this._last?.item[0] === key) this._last = prev;
    if (prev) prev.next = next;
    if (next) next.prev = prev;
    this.map.delete(key);
  }

  *values(key?: K) {
    let value = key ? this.map.get(key) : this._first;
    if (value === undefined) return;
    while (value?.item !== undefined) {
      yield value.item[1];
      value = value.next;
    }
  }

  *valuesBackwards(key?: K) {
    let value = key ? this.map.get(key) : this._last;
    if (value === undefined) return;
    while (value?.item !== undefined) {
      yield value.item[1];
      value = value.prev;
    }
  }

  *keys(): Generator<K> {
    let value = this._first;
    if (value === undefined) return;
    while (value?.item !== undefined) {
      yield value.item[0];
      value = value.next;
    }
  }

  getNextTo(key: K): [K, V] | undefined {
    return this.map.get(key)?.next?.item;
  }
}

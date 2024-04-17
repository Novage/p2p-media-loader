import { debug } from "p2p-media-loader-core";
import { useCallback, useEffect, useState } from "react";

export const DebugSelector = () => {
  const [activeLoggers, setActiveLoggers] = useLocalStorageItem<string[]>(
    "debug",
    [],
    loggersToStorageItem,
    storageItemToLoggers,
  );

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setActiveLoggers(
      Array.from(event.target.selectedOptions, (option) => option.value),
    );
  };

  return (
    <div>
      <h4 style={{ marginBottom: 10, marginTop: 0 }}>Loggers: </h4>
      <select
        value={activeLoggers}
        onChange={onChange}
        multiple
        style={{ width: 300, height: 200 }}
      >
        {loggers.map((logger) => (
          <option key={logger} value={logger}>
            {logger}
          </option>
        ))}
      </select>
    </div>
  );
};

function useLocalStorageItem<T>(
  prop: string,
  initValue: T,
  valueToStorageItem: (value: T) => string | null,
  storageItemToValue: (storageItem: string | null) => T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(
    storageItemToValue(localStorage[prop] as string | null) ?? initValue,
  );
  const setValueExternal = useCallback(
    (value: T | ((prev: T) => T)) => {
      setValue(value);
      if (typeof value === "function") {
        const prev = storageItemToValue(localStorage.getItem(prop));
        const next = (value as (prev: T) => T)(prev);
        const result = valueToStorageItem(next);
        if (result !== null) localStorage.setItem(prop, result);
        else localStorage.removeItem(prop);
      } else {
        const result = valueToStorageItem(value);
        if (result !== null) localStorage.setItem(prop, result);
        else localStorage.removeItem(prop);
      }
    },
    [prop, storageItemToValue, valueToStorageItem],
  );

  useEffect(() => {
    const eventHandler = (event: StorageEvent) => {
      if (event.key !== prop) return;
      const value = event.newValue;
      setValue(storageItemToValue(value));
    };
    window.addEventListener("storage", eventHandler);
    return () => {
      window.removeEventListener("storage", eventHandler);
    };
  }, [prop, storageItemToValue]);

  return [value, setValueExternal];
}

const loggers = [
  "p2pml-core:hybrid-loader-main",
  "p2pml-core:hybrid-loader-secondary",
  "p2pml-core:p2p-tracker-client",
  "p2pml-core:peer",
  "p2pml-core:p2p-loaders-container",
  "p2pml-core:request-main",
  "p2pml-core:request-secondary",
  "p2pml-core:segment-memory-storage",
] as const;

const loggersToStorageItem = (list: string[]) => {
  setTimeout(() => debug.enable(localStorage.debug as string), 0);
  if (list.length === 0) return null;
  return list.join(",");
};

const storageItemToLoggers = (storageItem: string | null) => {
  setTimeout(() => debug.enable(localStorage.debug as string), 0);
  if (!storageItem) return [];
  return storageItem.split(",");
};

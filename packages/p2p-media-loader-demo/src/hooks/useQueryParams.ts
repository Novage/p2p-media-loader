import { useState, useEffect, useCallback } from "react";
import { DEFAULT_STREAM, DEFAULT_TRACKERS, PLAYERS } from "../constants";

type QueryParamsType = Record<string, string>;

export function useQueryParams<T extends string>() {
  const [queryParams, setQueryParams] = useState<QueryParamsType>({
    player: PLAYERS[0],
    streamUrl: DEFAULT_STREAM,
    trackers: DEFAULT_TRACKERS,
  });

  const updateQueryParamsFromURL = useCallback(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const paramsObj: QueryParamsType = {};

    searchParams.forEach((value, key) => {
      paramsObj[key] = value;
    });

    if (Object.keys(paramsObj).length === 0) return;

    setQueryParams(paramsObj);
  }, []);

  const setURLQueryParams = useCallback(
    (newParams: Partial<Record<T, string>>) => {
      const searchParams = new URLSearchParams(window.location.search);

      Object.entries(newParams).forEach(([key, value]) => {
        if (value === null || value === undefined) {
          searchParams.delete(key);
        } else {
          searchParams.set(key, String(value));
        }
      });

      const newUrl = `${window.location.pathname}?${searchParams.toString()}`;

      window.history.pushState({}, "", newUrl);
      updateQueryParamsFromURL();
    },
    [updateQueryParamsFromURL],
  );

  useEffect(() => {
    updateQueryParamsFromURL();
  }, [updateQueryParamsFromURL]);

  return { queryParams, setURLQueryParams };
}

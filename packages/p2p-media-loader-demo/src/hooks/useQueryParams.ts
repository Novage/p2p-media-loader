import { useState, useEffect, useCallback, useMemo } from "react";
import { DEFAULT_STREAM, DEFAULT_TRACKERS, PLAYERS } from "../constants";

type QueryParamsType = Record<string, string>;

function getInitialParams(
  searchParams: URLSearchParams,
  defaultParams: QueryParamsType,
): QueryParamsType {
  return Object.keys(defaultParams).reduce<QueryParamsType>((params, key) => {
    params[key] = searchParams.get(key) ?? defaultParams[key];
    return params;
  }, {});
}

const getCurrentSearchParams = () =>
  new URLSearchParams(window.location.search);

export function useQueryParams(streamUri?: string) {
  const defaultParams = useMemo(() => {
    return {
      player: Object.keys(PLAYERS)[0],
      streamUrl: streamUri ?? DEFAULT_STREAM,
      trackers: DEFAULT_TRACKERS,
      debug: "",
      swarmId: "",
    } as QueryParamsType;
  }, [streamUri]);

  const [queryParams, setQueryParams] = useState<QueryParamsType>(() =>
    getInitialParams(getCurrentSearchParams(), defaultParams),
  );

  const updateQueryParamsFromURL = useCallback(() => {
    const searchParams = getCurrentSearchParams();
    const newParams = getInitialParams(searchParams, defaultParams);

    setQueryParams((prevParams) => {
      const hasChanges = Object.keys(newParams).some(
        (key) => prevParams[key] !== newParams[key],
      );
      return hasChanges ? newParams : prevParams;
    });
  }, [defaultParams]);

  const setURLQueryParams = useCallback(
    (newParams: Partial<QueryParamsType>) => {
      const searchParams = getCurrentSearchParams();

      Object.entries(newParams).forEach(([key, value]) => {
        if (value == undefined || value === defaultParams[key]) {
          searchParams.delete(key);
        } else {
          searchParams.set(key, value);
        }
      });

      const newUrl =
        searchParams.toString() === ""
          ? window.location.pathname
          : `${window.location.pathname}?${searchParams.toString()}`;
      window.history.pushState({}, "", newUrl);

      updateQueryParamsFromURL();
    },
    [defaultParams, updateQueryParamsFromURL],
  );

  useEffect(() => {
    window.addEventListener("popstate", updateQueryParamsFromURL);

    return () => {
      window.removeEventListener("popstate", updateQueryParamsFromURL);
    };
  }, [updateQueryParamsFromURL]);

  return { queryParams, setURLQueryParams };
}

import { useEffect, useRef } from "react";
import { Data, Network } from "vis-network";
import { NETWORK_GRAPH_OPTIONS } from "../constants";

type GraphNetworkProps = {
  data: Data;
};

export const GraphNetwork = ({ data }: GraphNetworkProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!networkRef.current) {
      networkRef.current = new Network(
        containerRef.current,
        data,
        NETWORK_GRAPH_OPTIONS,
      );
    } else {
      networkRef.current.setData(data);
    }
  }, [data]);
  return (
    <>
      <div className="graph-container" ref={containerRef} />
    </>
  );
};

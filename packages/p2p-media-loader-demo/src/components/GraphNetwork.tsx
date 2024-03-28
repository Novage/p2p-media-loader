import { useEffect, useRef, useState } from "react";
import { Data, Network } from "vis-network";
import { DEFAULT_GRAPH_DATA, NETWORK_GRAPH_OPTIONS } from "../constants";

type GraphNetworkProps = {
  graphData: Data;
};

export const GraphNetwork = ({ graphData }: GraphNetworkProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [network, setNetwork] = useState<Network | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const network = new Network(
      containerRef.current,
      DEFAULT_GRAPH_DATA,
      NETWORK_GRAPH_OPTIONS,
    );
    setNetwork(network);

    return () => {
      network.destroy();
    };
  }, []);

  useEffect(() => {
    if (!network) return;

    network.setData(graphData);
  }, [graphData, network]);

  return (
    <>
      <div className="graph-container" ref={containerRef} />
    </>
  );
};

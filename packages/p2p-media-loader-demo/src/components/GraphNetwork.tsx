import { useEffect, useRef, useState } from "react";
import { Network } from "vis-network";
import { DEFAULT_GRAPH_DATA, NETWORK_GRAPH_OPTIONS } from "../constants";

type GraphNetworkProps = {
  peers: string[];
};

export const GraphNetwork = ({ peers }: GraphNetworkProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [network, setNetwork] = useState<Network | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const networkInstance = new Network(
      containerRef.current,
      DEFAULT_GRAPH_DATA,
      NETWORK_GRAPH_OPTIONS,
    );
    setNetwork(networkInstance);

    return () => {
      networkInstance.destroy();
    };
  }, []);

  useEffect(() => {
    if (!network) return;

    const graphData = {
      nodes: [
        ...DEFAULT_GRAPH_DATA.nodes,
        ...peers.map((peer) => ({
          id: peer,
          label: peer,
          color: "#d8eb34",
        })),
      ],
      edges: peers.map((peer) => ({ from: peer, to: "1" })),
    };

    network.setData(graphData);
  }, [network, peers]);

  return <div className="graph-container" ref={containerRef} />;
};

import "./network.css";
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import {
  Link,
  updateGraph,
  Node,
  prepareGroups,
  createSimulation,
} from "./network";

type GraphNetworkProps = {
  peers: string[];
};

const DEFAULT_PEER_ID = "You";
const DEFAULT_NODE: Node = { id: DEFAULT_PEER_ID, isMain: true };
const DEFAULT_GRAPH_DATA = {
  nodes: [DEFAULT_NODE],
  links: [] as Link[],
};

type SvgDimensionsType = {
  width: number;
  height: number;
};

export const NodeNetwork = ({ peers }: GraphNetworkProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const networkDataRef = useRef(DEFAULT_GRAPH_DATA);
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);

  const [svgDimensions, setSvgDimensions] = useState<SvgDimensionsType>({
    width: 0,
    height: 0,
  });

  const handleResize = (entries: ResizeObserverEntry[]) => {
    const entry = entries[0];

    const newDimensions = {
      width: entry.contentRect.width,
      height: entry.contentRect.width > 380 ? 250 : 400,
    };

    setSvgDimensions(newDimensions);

    simulationRef.current?.stop();
    simulationRef.current = createSimulation(
      newDimensions.width,
      newDimensions.height,
    );

    updateGraph(
      networkDataRef.current.nodes,
      networkDataRef.current.links,
      simulationRef.current,
      svgRef.current,
    );
  };

  useEffect(() => {
    if (!svgRef.current) return;

    prepareGroups(svgRef.current);

    const resizeObserver = new ResizeObserver(handleResize);

    if (svgContainerRef.current) {
      resizeObserver.observe(svgContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const allNodes = [
      ...peers.map((peerId) => ({ id: peerId, isMain: false })),
      DEFAULT_NODE,
    ];

    const allLinks = peers.map((peerId) => {
      const target = allNodes.find((n) => n.id === peerId);

      if (!target) throw new Error("Target node not found");

      return {
        source: DEFAULT_NODE,
        target,
        linkId: `${DEFAULT_PEER_ID}-${peerId}`,
      };
    });

    const networkData = networkDataRef.current;

    const nodesToAdd = allNodes.filter(
      (an) => !networkData.nodes.find((n) => n.id === an.id),
    );
    const nodesToRemove = networkData.nodes.filter(
      (n) => !allNodes.find((an) => an.id === n.id),
    );
    const linksToAdd = allLinks.filter(
      (al) => !networkData.links.find((l) => l.linkId === al.linkId),
    );
    const linksToRemove = networkData.links.filter(
      (l) => !allLinks.find((al) => al.linkId === l.linkId),
    );

    const updatedNodes = networkData.nodes.filter(
      (n) => !nodesToRemove.find((rn) => rn.id === n.id),
    );
    const updatedLinks = networkData.links.filter(
      (l) => !linksToRemove.find((rl) => rl.linkId === l.linkId),
    );

    const newNetworkData = {
      nodes: [...updatedNodes, ...nodesToAdd],
      links: [...updatedLinks, ...linksToAdd],
    };

    networkDataRef.current = newNetworkData;

    updateGraph(
      newNetworkData.nodes,
      newNetworkData.links,
      simulationRef.current,
      svgRef.current,
    );
  }, [peers]);

  return (
    <div ref={svgContainerRef} className="node-container">
      <svg
        className="node-network"
        ref={svgRef}
        width={svgDimensions.width}
        height={svgDimensions.height}
      />
    </div>
  );
};

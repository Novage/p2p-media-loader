import { useEffect, useRef } from "react";
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

export const NodeNetwork = ({ peers }: GraphNetworkProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const networkDataRef = useRef(DEFAULT_GRAPH_DATA);
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    const simulation = createSimulation(width, height);

    simulationRef.current = simulation;

    prepareGroups(svgRef.current);

    return () => {
      simulation.stop();
    };
  }, []);

  useEffect(() => {
    const allNodes = [
      ...peers.map((peerId) => ({ id: peerId, isMain: false })),
      DEFAULT_NODE,
    ];

    const allLinks = peers.map((peerId) => ({
      source: DEFAULT_NODE,
      target: allNodes.find((n) => n.id === peerId)!,
      linkId: `${DEFAULT_PEER_ID}-${peerId}`,
    }));

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
      svgRef,
    );
  }, [peers]);

  return (
    <>
      <svg
        ref={svgRef}
        width="380"
        height="400"
        style={{ border: "1px solid black" }}
      ></svg>
    </>
  );
};

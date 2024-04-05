import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import {
  Link,
  updateGraph,
  Node,
  prepareGroups,
  createSimulation,
} from "./network";

type GraphData = {
  nodes: Node[];
  links: Link[];
};

type GraphNetworkProps = {
  peers: string[];
};

const DEFAULT_PEER_ID = "You";
const DEFAULT_GRAPH_DATA = {
  nodes: [{ id: DEFAULT_PEER_ID, isMain: true }],
  links: [],
};

export const NodeNetwork = ({ peers }: GraphNetworkProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [networkData, setNetworkData] = useState<GraphData>(DEFAULT_GRAPH_DATA);
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
      { id: DEFAULT_PEER_ID, isMain: true },
    ];
    const allLinks = peers.map((peerId) => ({
      source: DEFAULT_PEER_ID,
      target: peerId,
      linkId: `${DEFAULT_PEER_ID}-${peerId}`,
    }));

    setNetworkData((prevState) => {
      const nodesToAdd = allNodes.filter(
        (an) => !prevState.nodes.find((n) => n.id === an.id),
      );
      const nodesToRemove = prevState.nodes.filter(
        (n) => !allNodes.find((an) => an.id === n.id),
      );
      const linksToAdd = allLinks.filter(
        (al) => !prevState.links.find((l) => l.linkId === al.linkId),
      );
      const linksToRemove = prevState.links.filter(
        (l) => !allLinks.find((al) => al.linkId === l.linkId),
      );

      const updatedNodes = prevState.nodes.filter(
        (n) => !nodesToRemove.find((rn) => rn.id === n.id),
      );
      const updatedLinks = prevState.links.filter(
        (l) => !linksToRemove.find((rl) => rl.linkId === l.linkId),
      );

      return {
        nodes: [...updatedNodes, ...nodesToAdd],
        links: [...updatedLinks, ...linksToAdd],
      };
    });
  }, [peers]);

  useEffect(() => {
    updateGraph(
      networkData.nodes,
      networkData.links,
      simulationRef.current,
      svgRef,
    );
  }, [networkData]);

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

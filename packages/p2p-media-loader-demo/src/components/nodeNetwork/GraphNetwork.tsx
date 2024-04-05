import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Link, updateGraph, Node } from "./nodeNetwork";

interface GraphData {
  nodes: Node[];
  links: Link[];
}

type GraphNetworkProps = {
  peers: string[];
};

const DEFAULT_PEER_ID = "You";

export const GraphNetwork = ({ peers }: GraphNetworkProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<GraphData>({
    nodes: [{ id: DEFAULT_PEER_ID, isMain: true }],
    links: [],
  });
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    const simulation = d3
      .forceSimulation<Node, Link>()
      .force(
        "link",
        d3
          .forceLink<Node, Link>()
          .id((d) => d.id)
          .distance(100),
      )
      .force("charge", d3.forceManyBody())
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collide",
        d3
          .forceCollide()
          .radius((d) => ((d as Node).isMain ? 20 : 15))
          .iterations(2),
      );

    simulationRef.current = simulation;

    d3.select(svgRef.current).append("g").attr("class", "links");

    d3.select(svgRef.current).append("g").attr("class", "nodes");
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

    setNodes((prevState) => {
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
    updateGraph(nodes.nodes, nodes.links, simulationRef.current, svgRef);
  }, [nodes]);

  return (
    <>
      <button
        onClick={() => {
          setNodes((prev) => {
            return {
              nodes: [...prev.nodes, { id: String(prev.nodes.length) }],
              links: [
                ...prev.links,
                {
                  source: DEFAULT_PEER_ID,
                  target: String(prev.links.length + 1),
                  linkId: `${DEFAULT_PEER_ID}-${prev.links.length + 1}`,
                },
              ],
            };
          });
        }}
      >
        Update Graph
      </button>
      <button
        onClick={() => {
          setNodes((prev) => {
            return {
              nodes: prev.nodes.slice(0, -1),
              links: prev.links.slice(0, -1),
            };
          });
        }}
      >
        Delete Graph
      </button>
      <svg
        ref={svgRef}
        width="380"
        height="400"
        style={{ border: "1px solid black" }}
      ></svg>
    </>
  );
};

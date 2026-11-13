import "./network.css";
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import {
  Link,
  updateGraph,
  Node,
  createSimulation,
  centerSimulation,
} from "./network";

type GraphNetworkProps = {
  peers: string[];
};

const MAIN_NODE: Node = { id: "You", isMain: true };

export const NodeNetwork = ({ peers }: GraphNetworkProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<Node[]>([MAIN_NODE]);
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);

  const [svgDimensions, setSvgDimensions] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const svgElement = svgRef.current;
    const svgContainer = svgContainerRef.current;
    if (!svgElement || !svgContainer) return;

    const simulation = createSimulation(svgElement);
    simulationRef.current = simulation;

    const resizeObserver = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      const height = width > 380 ? 250 : 400;

      setSvgDimensions({ width, height });
      centerSimulation(simulation, width, height);
    });
    resizeObserver.observe(svgContainer);

    return () => {
      resizeObserver.disconnect();
      simulation.stop();
    };
  }, []);

  useEffect(() => {
    // Keeps the existing node objects, so the nodes keep their positions.
    const peerIds = new Set(peers);
    const keptNodes = nodesRef.current.filter(
      (node) => node.isMain || peerIds.has(node.id),
    );
    const keptIds = new Set(keptNodes.map((node) => node.id));
    const addedNodes = [...peerIds]
      .filter((peerId) => !keptIds.has(peerId))
      .map((peerId) => ({ id: peerId, isMain: false }));

    const nodes = [...keptNodes, ...addedNodes];
    nodesRef.current = nodes;

    const links = nodes
      .filter((node) => !node.isMain)
      .map((target) => ({ source: MAIN_NODE, target }));

    updateGraph(nodes, links, simulationRef.current, svgRef.current);
  }, [peers]);

  return (
    <div ref={svgContainerRef} className="node-container">
      <svg
        className="node-network"
        ref={svgRef}
        width={svgDimensions.width}
        height={svgDimensions.height}
      >
        <g className="links" />
        <g className="nodes" />
      </svg>
    </div>
  );
};

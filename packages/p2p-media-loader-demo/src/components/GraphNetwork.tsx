import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Simulation, SimulationNodeDatum, DragBehavior } from "d3";
interface Node extends SimulationNodeDatum {
  id: string;
  isMain?: boolean;
}

interface Link {
  source: string;
  target: string;
}

type GraphData = {
  nodes: Node[];
  links: Link[];
};

interface GraphProps {
  peers: string[];
}
const STYLE = {
  links: {
    width: 0.7,
    maxWidth: 5.0,
  },
};

const DEFAULT_PEER_ID = "You";

const COLORS = {
  links: "#C8C8C8",
  nodeHover: "#A9A9A9",
  node: (d: { isMain?: boolean }) => {
    return d.isMain ? "hsl(210, 70%, 72.5%)" : "hsl(55, 70%, 72.5%)";
  },
};

export const GraphNetwork = ({ peers }: GraphProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [],
    links: [],
  });

  useEffect(() => {
    const newNodes = peers.map((peer) => ({
      id: peer,
      isMain: peer === DEFAULT_PEER_ID,
    }));
    const newLinks = newNodes.map((node) => ({
      source: DEFAULT_PEER_ID,
      target: node.id,
    }));

    setGraphData({
      nodes: [{ id: DEFAULT_PEER_ID, isMain: true }, ...newNodes],
      links: newLinks,
    });
  }, [peers]);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const simulation = d3
      .forceSimulation(graphData.nodes)
      .force(
        "link",
        d3
          .forceLink(graphData.links)
          .id((d) => d.id)
          .distance(100), // Adjusted distance
      )
      .force("charge", d3.forceManyBody())
      .force("center", d3.forceCenter(300 / 2, 300 / 2));

    // Create links
    svg
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(graphData.links)
      .join("line")
      .style("stroke", COLORS.links)
      .style("stroke-width", STYLE.links.width);

    const node = svg
      .append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(graphData.nodes)
      .join("g");
    // Draw circles for nodes

    node
      .append("circle")
      .attr("r", (d) => (d.isMain ? 15 : 12))
      .attr("fill", (d) => COLORS.node(d))
      .on("mouseover", function () {
        d3.select(this).style("fill", COLORS.nodeHover);
      })
      .on("mouseout", function (event, d) {
        d3.select(this).style("fill", COLORS.node(d));
      });

    node
      .append("text")
      .text((d) => d.id)
      .attr("x", 0)
      .attr("y", (d) => (d.isMain ? -20 : -15))
      .style("text-anchor", "middle")
      .style("font-size", "12px")
      .style("font-family", "sans-serif");

    node.call(drag(simulation));

    simulation.on("tick", () => {
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);

      svg
        .selectAll(".links line")
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);
    });
  }, [graphData]);

  return (
    <svg
      ref={svgRef}
      style={{ border: "1px solid black" }}
      width="300"
      height="300"
    />
  );
};

const drag = (
  simulation: Simulation<Node, undefined>,
): DragBehavior<Element, Node, Node | d3.SubjectPosition> => {
  const dragstarted = (event: d3.D3DragEvent<Element, Node, Node>, d: Node) => {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  };

  const dragged = (event: d3.D3DragEvent<Element, Node, Node>, d: Node) => {
    d.fx = event.x;
    d.fy = event.y;
  };

  const dragended = (event: d3.D3DragEvent<Element, Node, Node>, d: Node) => {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  };

  return d3
    .drag<Element, Node>()
    .on("start", dragstarted)
    .on("drag", dragged)
    .on("end", dragended);
};

import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

// Assuming these interfaces are defined somewhere in your project
interface Node {
  id: string;
  isMain?: boolean;
  group?: number;
}

interface GraphData {
  nodes: Node[];
  links: Link[];
}

interface Link {
  source: string;
  target: string;
  value?: number;
}

const COLORS = {
  links: "#C8C8C8",
  nodeHover: "#A9A9A9",
  node: (d: { isMain?: boolean }) => {
    return d.isMain ? "hsl(210, 70%, 72.5%)" : "hsl(55, 70%, 72.5%)";
  },
};

export const GraphNetwork = () => {
  const svgRef = useRef<SVGElement>(null);
  const [nodes, setNodes] = useState<GraphData>({
    nodes: [{ id: "0", isMain: true }],
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
      .force("center", d3.forceCenter(width / 2, height / 2));
    simulationRef.current = simulation;

    d3.select(svgRef.current).append("g").attr("class", "links");

    d3.select(svgRef.current).append("g").attr("class", "nodes");
  }, []);

  // Update function to be called when nodes or links change
  const updateGraph = (newNodes: Node[], newLinks: Link[]) => {
    if (!simulationRef.current || !svgRef.current) return;

    const simulation = simulationRef.current;

    // Update the simulation with the new nodes and links
    simulation.nodes(newNodes);
    simulation.force<d3.ForceLink<Node, Link>>("link")?.links(newLinks);
    simulation.alpha(0.5).restart();

    // Select and update the links
    const link = d3
      .select(svgRef.current)
      .select(".links")
      .selectAll("line")
      .data(newLinks, (d) => `${d.source}-${d.target}`);

    link
      .enter()
      .append("line")
      .merge(link as any) // Merge enter and update selections
      .attr("stroke-width", 0.5)
      .attr("stroke", COLORS.links);

    link.exit().remove();

    // Select and update the nodes
    const node = d3
      .select(svgRef.current)
      .select(".nodes")
      .selectAll("circle")
      .data(newNodes, (d) => d.id);

    node
      .enter()
      .append("circle")
      .merge(node as any) // Merge enter and update selections
      .attr("r", (d) => (d.isMain ? 15 : 12))
      .attr("fill", (d) => COLORS.node(d))
      .on("mouseover", function () {
        d3.select(this).style("fill", COLORS.nodeHover);
      })
      .on("mouseout", function (event, d) {
        d3.select(this).style("fill", COLORS.node(d));
      })
      .call(drag(simulation));

    node.exit().remove();

    const text = d3
      .select(svgRef.current)
      .select(".nodes")
      .selectAll("text")
      .data(newNodes, (d) => d.id);

    text
      .enter()
      .append("text")
      .merge(text as any)
      .text((d) => d.id)
      .style("text-anchor", "middle")
      .style("font-size", "12px")
      .style("font-family", "sans-serif");

    text.exit().remove();
    // Update simulation on 'tick'
    simulation.on("tick", () => {
      d3.select(svgRef.current)
        .select(".links")
        .selectAll("line")
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      d3.select(svgRef.current)
        .select(".nodes")
        .selectAll("circle")
        .attr("cx", (d: any) => d.x)
        .attr("cy", (d: any) => d.y);

      d3.select(svgRef.current)
        .select(".nodes")
        .selectAll("text")
        .attr("x", (d: any) => d.x)
        .attr("y", (d: any) => d.y + (d.isMain ? -20 : -15));
    });
  };

  useEffect(() => {
    updateGraph(nodes!.nodes, nodes!.links);
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
                { source: "0", target: String(prev.links.length + 1) },
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

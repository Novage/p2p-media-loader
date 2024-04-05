/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface Node extends d3.SimulationNodeDatum {
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
  linkId: string;
}

type GraphNetworkProps = {
  peers: string[];
};

const DEFAULT_PEER_ID = "You";

const COLORS = {
  links: "#C8C8C8",
  nodeHover: "#A9A9A9",
  node: (d: { isMain?: boolean }) => {
    return d.isMain ? "hsl(210, 70%, 72.5%)" : "hsl(55, 70%, 72.5%)";
  },
};

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

  const updateGraph = (newNodes: Node[], newLinks: Link[]) => {
    if (!simulationRef.current || !svgRef.current) return;

    const simulation = simulationRef.current;

    simulation.nodes(newNodes);
    simulation.force<d3.ForceLink<Node, Link>>("link")?.links(newLinks);
    simulation.alpha(0.5).restart();

    const link = d3
      .select(svgRef.current)
      .select(".links")
      .selectAll("line")
      .data(newLinks, (d) => `${(d as Link).source}-${(d as Link).target}`);

    link
      .enter()
      .append("line")
      .merge(link as never)
      .attr("stroke", COLORS.links)
      .transition()
      .duration(500)
      .attr("stroke-width", 0.5);

    link
      .exit()
      .transition()
      .duration(500)
      .style("opacity", 0)
      .on("end", function () {
        d3.select(this).remove();
      });

    const node = d3
      .select(svgRef.current)
      .select(".nodes")
      .selectAll("circle")
      .data(newNodes, (d) => (d as Node).id);

    node
      .enter()
      .append("circle")
      .merge(node as never)
      .attr("r", (d) => (d.isMain ? 15 : 13))
      .attr("fill", (d) => COLORS.node(d))
      .on("mouseover", function () {
        d3.select(this).style("fill", COLORS.nodeHover);
      })
      .on("mouseout", function (event, d) {
        d3.select(this).style("fill", COLORS.node(d));
      })
      .call(drag(simulation));

    node.exit().transition().duration(500).attr("r", 0).remove();

    const text = d3
      .select(svgRef.current)
      .select(".nodes")
      .selectAll("text")
      .data(newNodes, (d) => (d as Node).id);

    text
      .enter()
      .append("text")
      .style("fill-opacity", 0)
      .merge(text as never)
      .text((d) => d.id)
      .style("text-anchor", "middle")
      .style("font-size", "12px")
      .style("font-family", "sans-serif")
      .transition()
      .duration(500)
      .style("fill-opacity", 1);

    text
      .exit()
      .transition()
      .duration(500)
      .style("fill-opacity", 0)
      .on("end", function () {
        d3.select(this).remove();
      });

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
        .attr("y", (d: any) => d.y + -20);
    });
  };

  useEffect(() => {
    updateGraph(nodes.nodes, nodes.links);
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

const drag = (
  simulation: d3.Simulation<Node, undefined>,
): d3.DragBehavior<SVGCircleElement, Node, Node | d3.SubjectPosition> => {
  const dragStarted = (
    event: d3.D3DragEvent<SVGCircleElement, Node, Node>,
    d: Node,
  ) => {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  };

  const dragged = (
    event: d3.D3DragEvent<SVGCircleElement, Node, Node>,
    d: Node,
  ) => {
    d.fx = event.x;
    d.fy = event.y;
  };

  const dragEnded = (
    event: d3.D3DragEvent<SVGCircleElement, Node, Node>,
    d: Node,
  ) => {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  };

  return d3
    .drag<SVGCircleElement, Node>()
    .on("start", dragStarted)
    .on("drag", dragged)
    .on("end", dragEnded);
};

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
  linksToBeAdded?: Link[];
  nodesToBeAdded?: Node[];
  linksToBeRemoved?: Link[];
  nodesToBeRemoved?: Node[];
};

interface GraphProps {
  peers: string[];
}
const STYLE = {
  links: {
    width: 0.7,
  },
};

const DEFAULT_PEER_ID = "You";

const DEFAULT_GRAPH_DATA: GraphData = {
  nodes: [{ id: DEFAULT_PEER_ID, isMain: true }],
  links: [],
  linksToBeAdded: [],
  nodesToBeAdded: [],
  linksToBeRemoved: [],
  nodesToBeRemoved: [],
};

const COLORS = {
  links: "#C8C8C8",
  nodeHover: "#A9A9A9",
  node: (d: { isMain?: boolean }) => {
    return d.isMain ? "hsl(210, 70%, 72.5%)" : "hsl(55, 70%, 72.5%)";
  },
};

export const GraphNetwork = ({ peers }: GraphProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<Simulation<SimulationNodeDatum, undefined>>();
  const [graphData, setGraphData] = useState<GraphData>(DEFAULT_GRAPH_DATA);

  useEffect(() => {
    const allNodes = [
      ...peers.map((peerId) => ({ id: peerId, isMain: false })),
      { id: DEFAULT_PEER_ID, isMain: true },
    ];
    const allLinks = peers.map((peerId) => ({
      source: DEFAULT_PEER_ID,
      target: peerId,
    }));

    setGraphData((prevGraphState) => {
      const linksToBeAdded = allLinks.filter(
        (newLink) =>
          !prevGraphState.links.some(
            (existingLink) =>
              existingLink.source === newLink.source &&
              existingLink.target === newLink.target,
          ),
      );
      const nodesToBeAdded = allNodes.filter(
        (node) => !prevGraphState.nodes.some((n) => n.id === node.id),
      );

      const nodesToBeRemoved = prevGraphState.nodes.filter(
        (node) => !allNodes.some((n) => n.id === node.id),
      );

      const linksToBeRemoved = prevGraphState.links.filter(
        (link) => !allNodes.some((node) => link.target === node.id),
      );

      const updatedNodes = [
        ...prevGraphState.nodes.filter(
          (n) => !nodesToBeRemoved.some((nr) => nr.id === n.id),
        ),
        ...nodesToBeAdded,
      ];

      const updatedLinks = prevGraphState.links
        .filter(
          (existingLink) =>
            !linksToBeRemoved.some(
              (linkToRemove) => linkToRemove.target === existingLink.target,
            ),
        )
        .concat(linksToBeAdded);
      return {
        nodes: updatedNodes,
        links: updatedLinks,
        nodesToBeAdded,
        nodesToBeRemoved,
        linksToBeAdded,
        linksToBeRemoved,
      };
    });
  }, [peers]);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const simulation = d3
      .forceSimulation()
      .force(
        "link",
        d3
          .forceLink()
          .id((d) => d.id)
          .distance(100),
      )
      .force("charge", d3.forceManyBody())
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collide",
        d3
          .forceCollide()
          .radius((d) => (d.isMain ? 20 : 15))
          .iterations(2),
      );

    simulationRef.current = simulation;

    addNodes(
      DEFAULT_GRAPH_DATA.nodes,
      DEFAULT_GRAPH_DATA.links,
      simulation,
      svgRef,
    );
  }, []);

  useEffect(() => {
    if (!simulationRef.current) return;
    console.log("Updating graph with new data", graphData);
    addNodes(
      graphData.nodesToBeAdded!,
      graphData.linksToBeAdded!,
      simulationRef.current,
      svgRef,
    );
    removeNodes(
      graphData.nodesToBeRemoved!,
      graphData.linksToBeRemoved!,
      simulationRef.current,
      svgRef,
    );
  }, [graphData]);

  return (
    <>
      <svg
        ref={svgRef}
        style={{ border: "1px solid black" }}
        width="380"
        height="400"
      />
    </>
  );
};

const removeNodes = (
  nodesToRemove: Node[],
  linksToRemove: Link[],
  simulation: Simulation<SimulationNodeDatum, undefined>,
  svgRef: React.RefObject<SVGSVGElement>,
) => {
  if (!svgRef.current || nodesToRemove.length === 0) return;

  console.log("Removing nodes", nodesToRemove);
  console.log("Removing links", linksToRemove);
  const svg = d3.select(svgRef.current);

  // Retrieve the current sets of nodes and links from the simulation
  const currentNodes = simulation.nodes();
  const currentLinks = simulation.force("link").links();

  // Filter out the nodes to remove
  const updatedNodes = currentNodes.filter(
    (n) => !nodesToRemove.some((rn) => rn.id === n.id),
  );

  // Filter out the links to remove. This includes any links connected to the nodes being removed.
  const updatedLinks = currentLinks.filter(
    (l) =>
      !linksToRemove.some(
        (rl) => rl.source.id === l.source.id && rl.target.id === l.target.id,
      ) &&
      !nodesToRemove.some(
        (rn) => rn.id === l.source.id || rn.id === l.target.id,
      ),
  );

  // Update the data bindings for nodes and links
  const nodeSelection = svg
    .select(".nodes")
    .selectAll("g")
    .data(updatedNodes, (d) => d.id);
  nodeSelection.exit().remove();

  const linkSelection = svg
    .select(".links")
    .selectAll("line")
    .data(updatedLinks);
  linkSelection.exit().remove();

  // Update the simulation with the filtered lists of nodes and links
  simulation.nodes(updatedNodes);
  simulation.force("link").links(updatedLinks);
  simulation.alpha(1).restart();
};

const addNodes = (
  newNodes: Node[],
  newLinks: Link[],
  simulation: Simulation<SimulationNodeDatum, undefined>,
  svgRef: React.RefObject<SVGSVGElement>,
) => {
  if (!svgRef.current || newNodes.length === 0) return;

  const svg = d3.select(svgRef.current);

  let linkGroup = svg.select(".links");
  if (linkGroup.empty()) {
    linkGroup = svg.append("g").attr("class", "links");
  }
  let nodeGroup = svg.select(".nodes");
  if (nodeGroup.empty()) {
    nodeGroup = svg.append("g").attr("class", "nodes");
  }

  const nodeSelection = nodeGroup.selectAll("g").data(newNodes, (d) => d.id);

  const newNode = nodeSelection.enter().append("g");

  newNode
    .append("circle")
    .attr("r", (d) => (d.isMain ? 15 : 13))
    .attr("fill", (d) => COLORS.node(d))
    .on("mouseover", function () {
      d3.select(this).style("fill", COLORS.nodeHover);
    })
    .on("mouseout", function (event, d) {
      d3.select(this).style("fill", COLORS.node(d));
    });

  newNode
    .append("text")
    .text((d) => d.id)
    .attr("x", 0)
    .attr("y", (d) => (d.isMain ? -20 : -15))
    .style("text-anchor", "middle")
    .style("font-size", "12px")
    .style("font-family", "sans-serif");

  const linkSelection = linkGroup.selectAll("line").data(newLinks); // Bind new links data

  linkSelection
    .enter()
    .append("line") // Use the enter selection for new links
    .style("stroke", COLORS.links)
    .style("stroke-width", STYLE.links.width);

  newNode.call(drag(simulation));

  simulation.on("tick", () => {
    nodeGroup
      .selectAll("g")
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    linkGroup
      .selectAll("line")
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);
  });

  simulation.nodes([...simulation.nodes(), ...newNodes]);
  simulation
    .force("link")
    .links([...simulation.force("link").links(), ...newLinks]);
  simulation.alpha(1).restart();
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

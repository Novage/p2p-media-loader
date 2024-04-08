import * as d3 from "d3";

export interface Node extends d3.SimulationNodeDatum {
  id: string;
  isMain?: boolean;
  group?: number;
  name: string;
}

export interface Link extends d3.SimulationLinkDatum<Node> {
  source: Node;
  target: Node;
  linkId: string;
}

const COLORS = {
  links: "#C8C8C8",
  nodeHover: "#A9A9A9",
  node: (d: { isMain?: boolean }) => {
    return d.isMain ? "hsl(210, 70%, 72.5%)" : "hsl(55, 70%, 72.5%)";
  },
};

function handleNodeMouseOver(this: SVGCircleElement) {
  d3.select(this).style("fill", COLORS.nodeHover);
}

function handleNodeMouseOut(this: SVGCircleElement, _event: unknown, d: Node) {
  d3.select(this).style("fill", COLORS.node(d));
}

function getLinkText(d: Link) {
  return `${d.source.name}-${d.target.name}`;
}

function getNodeId(d: Node) {
  return d.id;
}

function removeD3Item(this: d3.BaseType) {
  d3.select(this).remove();
}

export const updateGraph = (
  newNodes: Node[],
  newLinks: Link[],
  simulation: d3.Simulation<Node, Link> | null,
  svgRef: React.MutableRefObject<SVGSVGElement | null>,
) => {
  if (!simulation || !svgRef.current) return;

  simulation.nodes(newNodes);
  simulation.force<d3.ForceLink<Node, Link>>("link")?.links(newLinks);
  simulation.alpha(0.5).restart();

  const link = d3
    .select(svgRef.current)
    .select(".links")
    .selectAll<SVGLineElement, Link>("line")
    .data(newLinks, getLinkText);

  link
    .enter()
    .append("line")
    .merge(link)
    .attr("stroke", COLORS.links)
    .transition()
    .duration(500)
    .attr("stroke-width", 0.5);

  link
    .exit()
    .transition()
    .duration(200)
    .style("opacity", 0)
    .on("end", removeD3Item);

  const node = d3
    .select(svgRef.current)
    .select(".nodes")
    .selectAll<SVGCircleElement, Node>("circle")
    .data(newNodes, getNodeId);

  node
    .enter()
    .append("circle")
    .merge(node)
    .attr("r", (d) => (d.isMain ? 15 : 13))
    .attr("fill", (d) => COLORS.node(d))
    .on("mouseover", handleNodeMouseOver)
    .on("mouseout", handleNodeMouseOut)
    .call(drag(simulation));

  node.exit().transition().duration(200).attr("r", 0).remove();

  const text = d3
    .select(svgRef.current)
    .select(".nodes")
    .selectAll<SVGTextElement, Node>("text")
    .data(newNodes, getNodeId);

  text
    .enter()
    .append("text")
    .style("fill-opacity", 0)
    .merge(text)
    .text(getNodeId)
    .style("text-anchor", "middle")
    .style("font-size", "12px")
    .style("font-family", "sans-serif")
    .transition()
    .duration(500)
    .style("fill-opacity", 1);

  text
    .exit()
    .transition()
    .duration(200)
    .style("fill-opacity", 0)
    .on("end", removeD3Item);

  simulation.on("tick", () => {
    d3.select(svgRef.current)
      .select(".links")
      .selectAll<SVGLineElement, Link>("line")
      .attr("x1", (d) => d.source.x ?? 0)
      .attr("y1", (d) => d.source.y ?? 0)
      .attr("x2", (d) => d.target.x ?? 0)
      .attr("y2", (d) => d.target.y ?? 0);

    d3.select(svgRef.current)
      .select(".nodes")
      .selectAll<SVGCircleElement, Node>("circle")
      .attr("cx", (d) => d.x ?? 0)
      .attr("cy", (d) => d.y ?? 0);

    d3.select(svgRef.current)
      .select(".nodes")
      .selectAll<SVGTextElement, Node>("text")
      .attr("x", (d) => d.x ?? 0)
      .attr("y", (d) => (d.y === undefined ? 0 : d.y - 20));
  });
};

const drag = (simulation: d3.Simulation<Node, Link>) => {
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

export const prepareGroups = (svg: SVGElement) => {
  d3.select(svg).append("g").attr("class", "links");
  d3.select(svg).append("g").attr("class", "nodes");
};

export const createSimulation = (width: number, height: number) => {
  return d3
    .forceSimulation<Node, Link>()
    .force("link", d3.forceLink<Node, Link>().id(getNodeId).distance(100))
    .force("charge", d3.forceManyBody())
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force(
      "collide",
      d3
        .forceCollide<Node>()
        .radius((d) => (d.isMain ? 20 : 15))
        .iterations(2),
    );
};

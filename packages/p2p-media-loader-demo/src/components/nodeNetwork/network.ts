import * as d3 from "d3";
// `selection.transition()` exists only once d3-transition has patched the
// selection prototype. The `d3` package declares itself free of side effects.
// Thus a production bundler drops the d3-transition that `d3` re-exports when
// no named export of it is used. A direct import keeps the patch.
import "d3-transition";

export interface Node extends d3.SimulationNodeDatum {
  id: string;
  isMain: boolean;
}

export interface Link extends d3.SimulationLinkDatum<Node> {
  source: Node;
  target: Node;
}

const COLORS = {
  links: "#C8C8C8",
  node: (d: Node) =>
    d.isMain ? "hsl(210, 70%, 72.5%)" : "hsl(55, 70%, 72.5%)",
};

function getLinkText(d: Link) {
  return `${d.source.id}-${d.target.id}`;
}

function getNodeId(d: Node) {
  return d.id;
}

export const updateGraph = (
  nodes: Node[],
  links: Link[],
  simulation: d3.Simulation<Node, Link> | null,
  svgElement: SVGSVGElement | null,
) => {
  if (!simulation || !svgElement) return;

  simulation.nodes(nodes);
  simulation.force<d3.ForceLink<Node, Link>>("link")?.links(links);
  simulation.alpha(0.5).restart();

  const svg = d3.select(svgElement);
  const nodeGroup = svg.select(".nodes");

  svg
    .select(".links")
    .selectAll<SVGLineElement, Link>("line")
    .data(links, getLinkText)
    .join(
      (enter) => enter.append("line").attr("stroke", COLORS.links),
      undefined,
      (exit) => exit.transition().duration(200).style("opacity", 0).remove(),
    )
    .transition()
    .duration(500)
    .attr("stroke-width", 0.5)
    // Fades in again a link that comes back during its exit fade.
    .style("opacity", 1);

  nodeGroup
    .selectAll<SVGCircleElement, Node>("circle")
    .data(nodes, getNodeId)
    .join(
      (enter) => enter.append("circle").attr("r", 0).attr("fill", COLORS.node),
      undefined,
      (exit) => exit.transition().duration(200).attr("r", 0).remove(),
    )
    .call(drag(simulation))
    .transition()
    .duration(500)
    .attr("r", (d) => (d.isMain ? 15 : 13));

  nodeGroup
    .selectAll<SVGTextElement, Node>("text")
    .data(nodes, getNodeId)
    .join(
      (enter) => enter.append("text").text(getNodeId).style("fill-opacity", 0),
      undefined,
      (exit) =>
        exit.transition().duration(200).style("fill-opacity", 0).remove(),
    )
    .transition()
    .duration(500)
    .style("fill-opacity", 1);
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

export const createSimulation = (svgElement: SVGSVGElement) => {
  const svg = d3.select(svgElement);
  const linkGroup = svg.select(".links");
  const nodeGroup = svg.select(".nodes");

  return (
    d3
      .forceSimulation<Node, Link>()
      .force("link", d3.forceLink<Node, Link>().distance(110))
      .force("charge", d3.forceManyBody())
      .force("center", d3.forceCenter())
      .force(
        "collide",
        d3
          .forceCollide<Node>()
          .radius((d) => (d.isMain ? 20 : 15))
          .iterations(2),
      )
      // Selects on each tick, so exiting elements follow their nodes while
      // they fade out.
      .on("tick", () => {
        linkGroup
          .selectAll<SVGLineElement, Link>("line")
          .attr("x1", (d) => d.source.x ?? 0)
          .attr("y1", (d) => d.source.y ?? 0)
          .attr("x2", (d) => d.target.x ?? 0)
          .attr("y2", (d) => d.target.y ?? 0);

        nodeGroup
          .selectAll<SVGCircleElement, Node>("circle")
          .attr("cx", (d) => d.x ?? 0)
          .attr("cy", (d) => d.y ?? 0);

        nodeGroup
          .selectAll<SVGTextElement, Node>("text")
          .attr("x", (d) => d.x ?? 0)
          .attr("y", (d) => (d.y === undefined ? 0 : d.y - 20));
      })
  );
};

export const centerSimulation = (
  simulation: d3.Simulation<Node, Link>,
  width: number,
  height: number,
) => {
  simulation
    .force<d3.ForceCenter<Node>>("center")
    ?.x(width / 2)
    .y(height / 2);
  simulation.alpha(0.5).restart();
};

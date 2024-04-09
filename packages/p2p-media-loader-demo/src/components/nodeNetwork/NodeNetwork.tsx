import { useCallback, useEffect, useRef, useState } from "react";
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

const XL_NETWORK_DIMENSIONS = {
  width: 380,
  height: 400,
};

const L_NETWORK_DIMENSIONS = {
  width: 320,
  height: 400,
};

const MD_NETWORK_DIMENSIONS_LARGER = {
  width: 250,
  height: 400,
};

const MD_NETWORK_DIMENSIONS_SMALLER = {
  width: 250,
  height: 250,
};

const SM_NETWORK_DIMENSIONS = {
  width: 540,
  height: 250,
};

export const NodeNetwork = ({ peers }: GraphNetworkProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const networkDataRef = useRef(DEFAULT_GRAPH_DATA);
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);
  const [svgDimensions, setSvgDimensions] = useState({
    width: 380,
    height: 400,
  });

  const updateSvgDimensions = useCallback(() => {
    const clientWidth = document.documentElement.clientWidth;
    let newDimensions;

    if (clientWidth > 1200) {
      newDimensions = XL_NETWORK_DIMENSIONS;
    } else if (clientWidth > 992) {
      newDimensions = L_NETWORK_DIMENSIONS;
    } else if (clientWidth > 900) {
      newDimensions = MD_NETWORK_DIMENSIONS_LARGER;
    } else if (clientWidth > 768) {
      newDimensions = MD_NETWORK_DIMENSIONS_SMALLER;
    } else if (clientWidth > 576) {
      newDimensions = SM_NETWORK_DIMENSIONS;
    } else {
      newDimensions = {
        width: clientWidth < 320 ? 320 : clientWidth - 30,
        height: 250,
      };
    }

    if (!newDimensions) return;

    setSvgDimensions(newDimensions);

    simulationRef.current?.stop();
    simulationRef.current = createSimulation(
      newDimensions.width,
      newDimensions.height,
    );

    updateGraph(
      networkDataRef.current.nodes,
      networkDataRef.current.links,
      simulationRef.current,
      svgRef,
    );
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    updateSvgDimensions();
    prepareGroups(svgRef.current);

    window.addEventListener("resize", updateSvgDimensions);

    return () => {
      window.removeEventListener("resize", updateSvgDimensions);
    };
  }, [updateSvgDimensions]);

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
        className="node-network"
        ref={svgRef}
        width={svgDimensions.width}
        height={svgDimensions.height}
      ></svg>
    </>
  );
};

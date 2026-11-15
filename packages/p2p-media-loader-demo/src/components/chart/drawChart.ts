import { COLORS } from "../../constants";
import { ChartsData } from "./../../types";
import * as d3 from "d3";

const DOWNLOAD_KEYS = ["httpDownloaded", "p2pDownloaded"] as const;

const color = d3
  .scaleOrdinal<string, string>()
  .domain(DOWNLOAD_KEYS)
  .range([COLORS.yellow, COLORS.lightOrange]);

// The caller clears the SVG before each call. Thus this function draws all
// elements again.
export const drawChart = (
  svgElement: SVGSVGElement,
  data: ChartsData[],
  svgWidth: number,
  svgHeight: number,
) => {
  const margin = { top: 20, right: 1, bottom: 30, left: 25 },
    width = svgWidth - margin.left - margin.right,
    height = svgHeight - margin.top - margin.bottom;

  const svg = d3.select(svgElement);
  const content = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const downloadStatsStack = d3
    .stack<ChartsData, keyof ChartsData>()
    .keys(DOWNLOAD_KEYS)(data);

  const maxDownloadValue = d3.max(downloadStatsStack, (stack) =>
    d3.max(stack, (d) => d[1]),
  );
  const maxP2PUploadValue = d3.max(data, (d) => d.p2pUploaded);

  const xScale = d3
    .scaleLinear()
    .domain([data[0].seconds, data[data.length - 1].seconds])
    .range([0, width]);
  // The chart shows upload below zero. Thus the code negates upload values.
  const yScale = d3
    .scaleLinear()
    .domain([-(maxP2PUploadValue ?? 0), maxDownloadValue ?? 1])
    .range([height, 0]);

  const downloadStatsArea = d3
    .area<d3.SeriesPoint<ChartsData>>()
    .x((d) => xScale(d.data.seconds))
    .y0((d) => yScale(d[0]))
    .y1((d) => yScale(d[1]))
    .curve(d3.curveBasis);

  const p2pUploadArea = d3
    .area<ChartsData>()
    .x((d) => xScale(d.seconds))
    .y0(() => yScale(0))
    .y1((d) => yScale(-d.p2pUploaded))
    .curve(d3.curveBasis);

  // Axes
  content
    .append("g")
    .attr("class", "axis axis--x")
    .attr("transform", `translate(0,${height})`)
    .call(
      d3
        .axisBottom(xScale)
        .tickSize(-height)
        .tickFormat(() => ""),
    );
  content
    .append("g")
    .attr("class", "axis axis--y")
    .call(d3.axisLeft(yScale).tickSize(-width).ticks(5));
  content
    .selectAll(".axis line")
    .attr("stroke", "#ddd")
    .attr("stroke-dasharray", "2,2");

  // Data layers
  content
    .append("path")
    .datum(data)
    .attr("class", "p2p-upload-area")
    .attr("d", p2pUploadArea)
    .style("fill", COLORS.lightBlue)
    .style("opacity", 0.7);
  content
    .append("path")
    .datum(data)
    .attr("class", "p2p-upload-line")
    .attr("d", p2pUploadArea.lineY1())
    .style("fill", "none")
    .style("stroke", "blue")
    .style("stroke-width", 2);

  content
    .selectAll(".layer")
    .data(downloadStatsStack)
    .join("path")
    .attr("class", "layer")
    .attr("d", downloadStatsArea)
    .style("fill", (d) => color(d.key))
    .style("opacity", 0.7);
  content
    .selectAll(".line")
    .data(downloadStatsStack)
    .join("path")
    .attr("class", "line")
    .attr("d", downloadStatsArea.lineY1())
    .style("fill", "none")
    .style("stroke", (d) => color(d.key))
    .style("stroke-width", 1.5);

  return svg;
};

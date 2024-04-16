import { COLORS } from "../../constants";
import { ChartsData } from "./../../types";
import * as d3 from "d3";

export const drawChart = (
  svgElement: SVGSVGElement | null,
  data: ChartsData[],
) => {
  if (!svgElement) return;

  const margin = { top: 20, right: 1, bottom: 30, left: 25 },
    width = svgElement.clientWidth - margin.left - margin.right,
    height = svgElement.clientHeight - margin.top - margin.bottom;

  const svg = d3.select(svgElement);
  svg
    .selectAll("g")
    .data([null])
    .enter()
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const downloadStatsStack = d3
    .stack<ChartsData, keyof ChartsData>()
    .keys(["httpDownloaded", "p2pDownloaded"])(data);

  const maxDownloadValue = d3.max(downloadStatsStack, (stack) =>
    d3.max(stack, (d) => d[1]),
  );
  const maxP2PUploadValue = d3.min(data, (d) => d.p2pUploaded);

  const defaultDomain = [0, 1];
  const extentDomain = d3.extent(data, (d) => d.seconds) as [number, number];

  const xScale = d3
    .scaleLinear()
    .domain(
      extentDomain.every((extent) => extent !== undefined)
        ? extentDomain
        : defaultDomain,
    )
    .range([0, width]);
  const yScale = d3
    .scaleLinear()
    .domain([maxP2PUploadValue ?? 0, maxDownloadValue ?? 1])
    .range([height, 0]);

  const color = d3
    .scaleOrdinal()
    .domain(["httpDownloaded", "p2pDownloaded"])
    .range([COLORS.yellow, COLORS.lightOrange]);

  const downloadStatsArea = d3
    .area<d3.SeriesPoint<ChartsData>>()
    .x((d) => xScale(d.data.seconds))
    .y0((d) => yScale(d[0]))
    .y1((d) => yScale(d[1]))
    .curve(d3.curveBasis);
  const downloadStatsAreaLine = d3
    .line<d3.SeriesPoint<ChartsData>>()
    .x((d) => xScale(d.data.seconds))
    .y((d) => yScale(d[1]))
    .curve(d3.curveBasis);

  const p2pUploadArea = d3
    .area<ChartsData>()
    .x((d) => xScale(d.seconds))
    .y0(() => yScale(0))
    .y1((d) => yScale(d.p2pUploaded))
    .curve(d3.curveBasis);
  const p2pUploadLineArea = d3
    .line<ChartsData>()
    .x((d) => xScale(d.seconds))
    .y((d) => yScale(d.p2pUploaded))
    .curve(d3.curveBasis);

  const content = svg.select("g");
  content.selectAll(".axis").remove();

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
    )
    .selectAll("line")
    .attr("stroke", "#ddd")
    .attr("stroke-dasharray", "2,2");
  content
    .append("g")
    .attr("class", "axis axis--y")
    .call(d3.axisLeft(yScale).tickSize(-width).ticks(5))
    .selectAll("line")
    .attr("stroke", "#ddd")
    .attr("stroke-dasharray", "2,2");

  // Data layers
  content.selectAll(".layer").remove();
  content
    .selectAll(".p2p-upload-area")
    .data([data])
    .join("path")
    .attr("class", "p2p-upload-area")
    .attr("d", p2pUploadArea)
    .style("fill", COLORS.lightBlue)
    .style("opacity", 0.7);
  content
    .selectAll(".p2p-upload-line")
    .data([data])
    .join("path")
    .attr("class", "p2p-upload-line")
    .attr("d", p2pUploadLineArea)
    .style("fill", "none")
    .style("stroke", "blue")
    .style("stroke-width", 2);

  content
    .selectAll(".layer")
    .data(downloadStatsStack)
    .enter()
    .append("path")
    .attr("class", "layer")
    .attr("d", downloadStatsArea)
    .style("fill", (_d, i) => color(i.toString()) as string)
    .style("opacity", 0.7);
  content
    .selectAll(".line")
    .data(downloadStatsStack)
    .join("path")
    .attr("class", "line")
    .attr("d", downloadStatsAreaLine)
    .style("fill", "none")
    .style("stroke", (_d, i) => color(i.toString()) as string)
    .style("stroke-width", 1.5);

  return svg;
};

/* eslint-disable @typescript-eslint/ban-ts-comment */

import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { DownloadStats } from "../Demo";
import { COLORS } from "../../constants";
import "./chart.css";
import { ChartLegend } from "./ChartLegend";

const margin = { top: 20, right: 20, bottom: 30, left: 50 },
  width = 710 - margin.left - margin.right,
  height = 310 - margin.top - margin.bottom;

type StatsChartProps = {
  downloadStatsRef: React.RefObject<DownloadStats>;
};

type ChartsData = {
  seconds: number;
  httpDownloaded: number;
  p2pDownloaded: number;
  p2pUploaded: number;
};

const generateInitialStackedData = () => {
  const nowInSeconds = Math.floor(performance.now() / 1000);
  return Array.from({ length: 120 }, (_, i) => ({
    seconds: nowInSeconds - (120 - i),
    httpDownloaded: 0,
    p2pDownloaded: 0,
    p2pUploaded: 0,
  }));
};

type StoredData = {
  totalDownloaded: number;
  httpDownloaded: number;
  p2pDownloaded: number;
  p2pUploaded: number;
};

export const MovingStackedAreaChart = ({
  downloadStatsRef,
}: StatsChartProps) => {
  const [data, setData] = useState<ChartsData[]>(generateInitialStackedData());
  const [storedData, setStoredData] = useState<StoredData>({
    totalDownloaded: 0,
    httpDownloaded: 0,
    p2pDownloaded: 0,
    p2pUploaded: 0,
  });
  const svgRef = useRef(null);

  useEffect(() => {
    const intervalID = setInterval(() => {
      if (!downloadStatsRef.current) return;

      const { httpDownloaded, p2pDownloaded, p2pUploaded } =
        downloadStatsRef.current;
      console.log("httpDownloaded", httpDownloaded);
      setData((prevData: ChartsData[]) => {
        const newData: ChartsData = {
          seconds: Math.floor(performance.now() / 1000),
          httpDownloaded: httpDownloaded,
          p2pDownloaded: p2pDownloaded,
          p2pUploaded: p2pUploaded * -1,
        };
        return [...prevData.slice(1), newData];
      });

      setStoredData((prevData) => ({
        totalDownloaded:
          prevData.totalDownloaded + httpDownloaded + p2pDownloaded,
        httpDownloaded: prevData.httpDownloaded + httpDownloaded,
        p2pDownloaded: prevData.p2pDownloaded + p2pDownloaded,
        p2pUploaded: prevData.p2pUploaded + p2pUploaded,
      }));

      downloadStatsRef.current.httpDownloaded = 0;
      downloadStatsRef.current.p2pDownloaded = 0;
      downloadStatsRef.current.p2pUploaded = 0;
    }, 1000);

    return () => clearInterval(intervalID);
  }, [downloadStatsRef]);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg
      .selectAll("g")
      .data([null])
      .enter()
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const downloadStatsStack = d3
      .stack()
      .keys(["httpDownloaded", "p2pDownloaded"])(data);

    const maxDownloadValue = d3.max(downloadStatsStack, (stack) =>
      d3.max(stack, (d) => d[1]),
    );
    const maxP2PUploadValue = d3.min(data, (d) => d.p2pUploaded);

    const xScale = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => d.seconds))
      .range([0, width]);
    const yScale = d3
      .scaleLinear()
      .domain([maxP2PUploadValue, maxDownloadValue])
      .range([height, 0]);

    const color = d3
      .scaleOrdinal()
      .domain(["httpDownloaded", "p2pDownloaded"])
      .range([COLORS.yellow, COLORS.lightOrange]);

    const downloadStatsArea = d3
      .area()
      .x((d) => xScale(d.data.seconds))
      .y0((d) => yScale(d[0]))
      .y1((d) => yScale(d[1]))
      .curve(d3.curveBasis);
    const downloadStatAreaLine = d3
      .line()
      .x((d) => xScale(d.data.seconds))
      .y((d) => yScale(d[1]))
      .curve(d3.curveBasis);

    const p2pUploadArea = d3
      .area()
      .x((d) => xScale(d.seconds))
      .y0(() => yScale(0))
      .y1((d) => yScale(d.p2pUploaded))
      .curve(d3.curveBasis);
    const p2pUploadLineArea = d3
      .line()
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
      .call(d3.axisBottom(xScale).tickSize(-height).tickFormat(""))
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
      .selectAll(".series3-area")
      .data([data])
      .join("path")
      .attr("class", "series3-area")
      .attr("d", p2pUploadArea)
      .style("fill", COLORS.lightBlue)
      .style("opacity", 0.7);
    content
      .selectAll(".series3-line")
      .data([data])
      .join("path")
      .attr("class", "series3-line")
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
      .style("fill", (i) => color(i))
      .style("opacity", 0.7);
    content
      .selectAll(".line")
      .data(downloadStatsStack)
      .join("path")
      .attr("class", "line")
      .attr("d", downloadStatAreaLine)
      .style("fill", "none")
      .style("stroke", (i) => color(i))
      .style("stroke-width", 1.5);

    return () => {
      svg.selectAll("*").remove();
    };
  }, [data]);

  return (
    <div className="chart-container">
      <div className="legend-container">
        <ChartLegend
          legendItems={[
            {
              color: COLORS.torchRed,
              content: `Download - ${storedData.totalDownloaded.toFixed(2)} Mb `,
            },
            {
              color: COLORS.yellow,
              content: `- HTTP - ${storedData.httpDownloaded.toFixed(2)} Mb - ${calculatePercentage(storedData.httpDownloaded, storedData.totalDownloaded)}%`,
            },
            {
              color: COLORS.lightOrange,
              content: `- P2P - ${storedData.p2pDownloaded.toFixed(2)} Mb - ${calculatePercentage(storedData.p2pDownloaded, storedData.totalDownloaded)}%`,
            },
            {
              color: COLORS.lightBlue,
              content: `Upload P2P - ${storedData.p2pUploaded.toFixed(2)} Mb`,
            },
          ]}
        />
        <ChartLegend
          legendItems={[
            {
              color: COLORS.torchRed,
              content: `Download - ${data[data.length - 1].httpDownloaded.toFixed(2)} Mbps`,
            },
            {
              color: COLORS.yellow,
              content: `- HTTP - ${data[data.length - 1].httpDownloaded.toFixed(2)} Mbps`,
            },
            {
              color: COLORS.lightOrange,
              content: `- P2P - ${data[data.length - 1].p2pDownloaded.toFixed(2)} Mbps`,
            },
            {
              color: COLORS.lightBlue,
              content: `Upload P2P - ${(data[data.length - 1].p2pUploaded * -1).toFixed(2)} Mbps`,
            },
          ]}
        />
      </div>
      <svg ref={svgRef} width={710} height={310} />
    </div>
  );
};

const calculatePercentage = (part: number, total: number) => {
  if (total === 0) {
    return 0;
  }
  return ((part / total) * 100).toFixed(2);
};

/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - d3 is not typed

import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { DownloadStats } from "./Demo";
import { COLORS } from "../constants";
import "./chart.css";

const margin = { top: 20, right: 20, bottom: 30, left: 50 },
  width = 710 - margin.left - margin.right,
  height = 310 - margin.top - margin.bottom;

type StatsChartProps = {
  downloadStatsRef: React.RefObject<DownloadStats>;
};

type ChartsData = {
  date: number;
  series1: number;
  series2: number;
  series3: number;
};

const generateInitialStackedData = () => {
  const nowInSeconds = Math.floor(performance.now() / 1000);
  return Array.from({ length: 120 }, (_, i) => ({
    date: nowInSeconds - (120 - i),
    series1: 0,
    series2: 0,
    series3: 0,
  }));
};

export const MovingStackedAreaChart = ({
  downloadStatsRef,
}: StatsChartProps) => {
  const [data, setData] = useState<ChartsData[]>(generateInitialStackedData());
  const [storedData, setStoredData] = useState<Omit<ChartsData, "date">>({
    series1: 0,
    series2: 0,
    series3: 0,
  });
  const svgRef = useRef(null);

  useEffect(() => {
    const intervalID = setInterval(() => {
      if (!downloadStatsRef.current) return;

      const { series1, series2, series3 } = downloadStatsRef.current;
      setData((prevData) => {
        const newData = {
          date: Math.floor(performance.now() / 1000),
          series1: series1,
          series2: series2,
          series3: series3 * -1,
        };
        return [...prevData.slice(1), newData];
      });

      setStoredData((prevData) => ({
        series1: prevData.series1 + series1,
        series2: prevData.series2 + series2,
        series3: prevData.series3 + series3,
      }));

      downloadStatsRef.current = {
        series1: 0,
        series2: 0,
        series3: 0,
      };
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

    const content = svg.select("g");

    const series = d3.stack().keys(["series1", "series2"])(data);

    const maxStackedValue = d3.max(series, (serie) =>
      d3.max(serie, (d) => d[1]),
    );
    const minSeries3Value = d3.min(data, (d) => d.series3);

    const xScale = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => d.date))
      .range([0, width]);
    const yScale = d3
      .scaleLinear()
      .domain([minSeries3Value, maxStackedValue])
      .range([height, 0]);

    const color = d3
      .scaleOrdinal()
      .domain(["series1", "series2"])
      .range([COLORS.yellow, COLORS.lightOrange]);

    const area = d3
      .area()
      .x((d) => xScale(d.data.date))
      .y0((d) => yScale(d[0]))
      .y1((d) => yScale(d[1]))
      .curve(d3.curveBasis);

    const areaSeries3 = d3
      .area()
      .x((d) => xScale(d.date))
      .y0(() => yScale(0))
      .y1((d) => yScale(d.series3))
      .curve(d3.curveBasis);

    const line = d3
      .line()
      .x((d) => xScale(d.data.date))
      .y((d) => yScale(d[1]))
      .curve(d3.curveBasis);

    const lineSeries3 = d3
      .line()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.series3))
      .curve(d3.curveBasis);

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
      .attr("d", areaSeries3)
      .style("fill", COLORS.lightBlue)
      .style("opacity", 0.7);
    content
      .selectAll(".series3-line")
      .data([data])
      .join("path")
      .attr("class", "series3-line")
      .attr("d", lineSeries3)
      .style("fill", "none")
      .style("stroke", "blue")
      .style("stroke-width", 2);

    content
      .selectAll(".layer")
      .data(series)
      .enter()
      .append("path")
      .attr("class", "layer")
      .attr("d", area)
      .style("fill", (d, i) => color(i))
      .style("opacity", 0.7);
    content
      .selectAll(".line")
      .data(series)
      .join("path")
      .attr("class", "line")
      .attr("d", line)
      .style("fill", "none")
      .style("stroke", (d, i) => color(i))
      .style("stroke-width", 1.5);

    return () => {
      svg.selectAll("*").remove();
    };
  }, [data]);

  return (
    <div className="chart-container">
      <div className="chart-legend">
        <div className="line">
          <div
            className="swatch"
            style={{ backgroundColor: COLORS.torchRed }}
          />
          <p>
            Download - {(storedData.series1 + storedData.series2).toFixed(2)}{" "}
            Mbps
          </p>
        </div>
        <div className="line">
          <div className="swatch" style={{ backgroundColor: COLORS.yellow }} />
          <p> - HTTP - {storedData.series1.toFixed(2)} Mbps</p>
        </div>
        <div className="line">
          <div
            className="swatch"
            style={{ backgroundColor: COLORS.lightOrange }}
          />
          <p> - P2P - {storedData.series2.toFixed(2)} Mbps</p>
        </div>
        <div className="line">
          <div
            className="swatch"
            style={{ backgroundColor: COLORS.lightBlue }}
          />
          <p>Upload P2P - {storedData.series3.toFixed(2)} Mbps</p>
        </div>
      </div>
      <svg ref={svgRef} width={710} height={310} />
    </div>
  );
};

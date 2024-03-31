/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - d3 is not typed

import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

const generateInitialStackedData = () => {
  return Array.from({ length: 120 }, (_, i) => ({
    date: new Date(Date.now() - (19 - i) * 1000 * 60 * 60 * 24), // 20 days of data
    series1: Math.random() * 100,
    series2: Math.random() * 100,
    series3: Math.random() * -100,
  }));
};

const generateNewStackedDataItem = (data) => {
  const lastDate = data[data.length - 1].date;
  return {
    date: new Date(lastDate.getTime() + 1000 * 60 * 60 * 24),
    series1: Math.random() * 100,
    series2: Math.random() * 100,
    series3: Math.random() * 100,
  };
};

export const MovingStackedAreaChart = () => {
  const [data, setData] = useState(generateInitialStackedData());
  const svgRef = useRef(null);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setData((currentData) => [
        ...currentData.slice(1),
        generateNewStackedDataItem(currentData),
      ]);
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    const margin = { top: 20, right: 20, bottom: 30, left: 50 },
      width = 710 - margin.left - margin.right,
      height = 250 - margin.top - margin.bottom;

    // Set up the SVG container if it's not already there
    const svg = d3.select(svgRef.current);
    svg
      .selectAll("g")
      .data([null])
      .enter()
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const content = svg.select("g");

    const series = d3.stack().keys(["series1", "series2"])(data); // Only stack positive series

    const maxStackedValue = d3.max(series, (serie) =>
      d3.max(serie, (d) => d[1]),
    );
    const minSeries3Value = d3.min(data, (d) => d.series3); // Assuming series3 is always negative

    // Scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => d.date))
      .range([0, width]);
    const yScale = d3
      .scaleLinear()
      .domain([minSeries3Value, maxStackedValue])
      .range([height, 0]);

    // Colors
    const color = d3.scaleOrdinal(d3.schemeCategory10);

    // Area generator
    const area = d3
      .area()
      .x((d) => xScale(d.data.date))
      .y0((d) => yScale(d[0]))
      .y1((d) => yScale(d[1]))
      .curve(d3.curveBasis);

    const areaSeries3 = d3
      .area()
      .x((d) => xScale(d.date))
      .y0(() => yScale(0)) // This now represents the starting point at the Y-axis line
      .y1((d) => yScale(d.series3)) // Extend down to represent the negative value
      .curve(d3.curveBasis); // Keeping the curve smooth

    // Define the line generator
    const line = d3
      .line()
      .x((d) => xScale(d.data.date))
      .y((d) => yScale(d[1])) // Use the y1 value for the line's y position
      .curve(d3.curveBasis); // Ensure the line is smoothed

    const lineSeries3 = d3
      .line()
      .x((d) => xScale(d.date))
      .y((d) => yScale(d.series3))
      .curve(d3.curveBasis); // Match the curve style of the area

    // First, draw the axes (make sure this comes first)
    content.selectAll(".axis").remove(); // Clear previous axes, if any
    // X-axis
    content
      .append("g")
      .attr("class", "axis axis--x")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale).tickSize(-height).tickFormat(""))
      .selectAll("line")
      .attr("stroke", "#ddd")
      .attr("stroke-dasharray", "2,2");
    // Y-axis
    content
      .append("g")
      .attr("class", "axis axis--y")
      .call(d3.axisLeft(yScale).tickSize(-width))
      .selectAll("line")
      .attr("stroke", "#ddd")
      .attr("stroke-dasharray", "2,2");

    // Clear previous areas
    content.selectAll(".layer").remove();
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
    content
      .selectAll(".series3-area")
      .data([data]) // Ensure data is wrapped in an array for D3's area generator
      .join("path")
      .attr("class", "series3-area")
      .attr("d", areaSeries3)
      .style("fill", "lightblue") // Choose a distinctive fill color for series3
      .style("opacity", 0.7);
    content
      .selectAll(".series3-line")
      .data([data])
      .join("path")
      .attr("class", "series3-line")
      .attr("d", lineSeries3)
      .style("fill", "none")
      .style("stroke", "blue") // Ensure it's visually distinct
      .style("stroke-width", 2);
  }, [data]);

  return <svg ref={svgRef} width={710} height={250}></svg>;
};

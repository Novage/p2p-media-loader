/* eslint-disable @typescript-eslint/ban-ts-comment */
import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface DataItem {
  value: number;
}

export const MovingLineChart = () => {
  const [data, setData] = useState<DataItem[]>(generateInitialData());
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setData((currentData) => [
        ...currentData.slice(1),
        generateNewDataItem(),
      ]);
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    const margin = { top: 20, right: 30, bottom: 30, left: 50 };
    const width = 710 - margin.left - margin.right;
    const height = 250 - margin.top - margin.bottom;

    const xScale = d3
      .scaleLinear()
      .domain([0, data.length - 1])
      .range([0, width]);

    const yMaxValue = Math.max(1, d3.max(data, (d) => d.value) ?? 1);
    const yTicksCount =
      Math.round(yMaxValue / 2) % 2 === 0
        ? Math.round(yMaxValue / 2)
        : Math.round(yMaxValue / 2) + 1;

    const yScale = d3
      .scaleLinear()
      .domain([0, yMaxValue])
      .range([height, 0])
      .nice();

    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3
      .select(svgRef.current)
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const area = d3
      .area<DataItem>()
      .x((_, i) => xScale(i))
      .y0(height)
      .y1((d) => yScale(d.value))
      .curve(d3.curveBasis);

    // Create grid lines for the y-axis
    svg
      .append("g")
      .attr("class", "grid")
      // @ts-ignore
      .call(
        d3.axisLeft(yScale).tickSize(-width).ticks(yTicksCount).tickFormat(""),
      )
      .selectAll(".tick line")
      .style("stroke", "#ddd")
      .style("stroke-dasharray", "2,2");

    svg
      .append("g")
      .attr("class", "grid")
      .attr("transform", `translate(0,${height})`)
      // @ts-ignore
      .call(d3.axisBottom(xScale).tickSize(-height).tickFormat(""))
      .selectAll(".tick line")
      .style("stroke", "#ddd")
      .style("stroke-dasharray", "2,2");

    // Add the area
    svg
      .append("path")
      .datum(data)
      .attr("class", "area")
      .attr("fill", "steelblue")
      .attr("fill-opacity", 0.5)
      .attr("d", area);

    svg
      .append("path")
      .datum(data)
      .attr("class", "line")
      .attr("fill", "none")
      .attr("stroke", "darkblue")
      .attr("stroke-width", 1.2)
      .attr("d", area);

    // Add the solid y-axis on the left
    svg
      .append("g")
      .call(d3.axisLeft(yScale).ticks(yTicksCount))
      .select(".domain")
      .style("stroke", "#000")
      .style("stroke-width", "2");

    // Add the solid x-axis at the bottom
    svg
      .append("g")
      .attr("transform", `translate(0,${height})`)
      // @ts-ignore
      .call(d3.axisBottom(xScale).tickFormat(""))
      .select(".domain")
      .style("stroke", "#000")
      .style("stroke-width", "2");
  }, [data]);

  return <svg ref={svgRef}></svg>;
};

function generateInitialData(): DataItem[] {
  return Array.from({ length: 60 }, () => ({
    value: Math.random() * 10,
  }));
}

function generateNewDataItem(): DataItem {
  return {
    value: Math.random() * 10,
  };
}

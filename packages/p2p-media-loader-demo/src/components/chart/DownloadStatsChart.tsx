import "./chart.css";
import { useEffect, useRef, useState } from "react";
import { DownloadStats, ChartsData } from "../../types";
import { COLORS } from "../../constants";
import { ChartLegend } from "./ChartLegend";
import { drawChart } from "./drawChart";

const CHART_SAMPLE_COUNT = 120;
const CHART_HEIGHT = 310;

const generateInitialStackedData = () => {
  const now = performance.now() / 1000;
  return Array.from({ length: CHART_SAMPLE_COUNT }, (_, i) => ({
    seconds: now - (CHART_SAMPLE_COUNT - 1 - i),
    httpDownloaded: 0,
    p2pDownloaded: 0,
    p2pUploaded: 0,
  }));
};

const convertToMiB = (bytes: number) => bytes / 1024 / 1024;
const convertToMbit = (bytes: number, seconds: number) =>
  (bytes * 8) / 1_000_000 / seconds;

const calculatePercentage = (part: number, total: number) =>
  total === 0 ? "0.00" : ((part / total) * 100).toFixed(2);

const buildLegendItems = (
  { httpDownloaded, p2pDownloaded, p2pUploaded }: DownloadStats,
  unit: string,
  showShare = false,
) => {
  const totalDownloaded = httpDownloaded + p2pDownloaded;
  const share = (part: number) =>
    showShare ? ` - ${calculatePercentage(part, totalDownloaded)}%` : "";

  return [
    {
      color: COLORS.torchRed,
      content: `Download - ${totalDownloaded.toFixed(2)} ${unit}`,
    },
    {
      color: COLORS.yellow,
      content: `- HTTP - ${httpDownloaded.toFixed(2)} ${unit}${share(httpDownloaded)}`,
    },
    {
      color: COLORS.lightOrange,
      content: `- P2P - ${p2pDownloaded.toFixed(2)} ${unit}${share(p2pDownloaded)}`,
    },
    {
      color: COLORS.lightBlue,
      content: `Upload P2P - ${p2pUploaded.toFixed(2)} ${unit}`,
    },
  ];
};

type StatsChartProps = {
  downloadStatsRef: React.RefObject<DownloadStats>;
};

export const DownloadStatsChart = ({ downloadStatsRef }: StatsChartProps) => {
  const [data, setData] = useState<ChartsData[]>(() =>
    generateInitialStackedData(),
  );

  const [totals, setTotals] = useState<DownloadStats>({
    httpDownloaded: 0,
    p2pDownloaded: 0,
    p2pUploaded: 0,
  });

  const [svgWidth, setSvgWidth] = useState(0);

  const svgRef = useRef<SVGSVGElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastTickMs = performance.now();

    const intervalID = setInterval(() => {
      const { httpDownloaded, p2pDownloaded, p2pUploaded } =
        downloadStatsRef.current;
      // A hidden tab can run this timer much less often than each second. An
      // early tick counts as 1 second, so a short interval makes no spike.
      const tickMs = performance.now();
      const elapsedSeconds = Math.max((tickMs - lastTickMs) / 1000, 1);
      lastTickMs = tickMs;

      setData((prevData: ChartsData[]) => [
        ...prevData.slice(1),
        {
          seconds: tickMs / 1000,
          httpDownloaded: convertToMbit(httpDownloaded, elapsedSeconds),
          p2pDownloaded: convertToMbit(p2pDownloaded, elapsedSeconds),
          p2pUploaded: convertToMbit(p2pUploaded, elapsedSeconds),
        },
      ]);

      setTotals((prevTotals) => ({
        httpDownloaded:
          prevTotals.httpDownloaded + convertToMiB(httpDownloaded),
        p2pDownloaded: prevTotals.p2pDownloaded + convertToMiB(p2pDownloaded),
        p2pUploaded: prevTotals.p2pUploaded + convertToMiB(p2pUploaded),
      }));

      downloadStatsRef.current.httpDownloaded = 0;
      downloadStatsRef.current.p2pDownloaded = 0;
      downloadStatsRef.current.p2pUploaded = 0;
    }, 1000);

    return () => {
      clearInterval(intervalID);
    };
  }, [downloadStatsRef]);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(([entry]) => {
      setSvgWidth(entry.contentRect.width);
    });

    if (svgContainerRef.current) {
      resizeObserver.observe(svgContainerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = drawChart(svgRef.current, data, svgWidth, CHART_HEIGHT);

    return () => {
      svg.selectAll("*").remove();
    };
  }, [data, svgWidth]);

  return (
    <div ref={svgContainerRef} className="chart-container">
      <div className="legend-container">
        <ChartLegend legendItems={buildLegendItems(totals, "MiB", true)} />
        <ChartLegend
          legendItems={buildLegendItems(data[data.length - 1], "Mbit/s")}
        />
      </div>
      <svg ref={svgRef} width={svgWidth} height={CHART_HEIGHT} />
    </div>
  );
};

import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadStats } from "../P2PVideoDemo";
import { COLORS } from "../../constants";
import "./chart.css";
import { ChartLegend } from "./ChartLegend";
import { drawChart } from "./drawChart";

const generateInitialStackedData = () => {
  const nowInSeconds = Math.floor(performance.now() / 1000);
  return Array.from({ length: 120 }, (_, i) => ({
    seconds: nowInSeconds - (120 - i),
    httpDownloaded: 0,
    p2pDownloaded: 0,
    p2pUploaded: 0,
  }));
};

const convertToMiB = (bytes: number) => bytes / 1024 / 1024;
const convertToMbit = (bytes: number) => (bytes * 8) / 1_000_000;

const calculatePercentage = (part: number, total: number) => {
  if (total === 0) {
    return 0;
  }
  return ((part / total) * 100).toFixed(2);
};

type StatsChartProps = {
  downloadStatsRef: React.RefObject<DownloadStats>;
};

export type ChartsData = {
  seconds: number;
} & DownloadStats;

type StoredData = {
  totalDownloaded: number;
} & DownloadStats;

const XL_CHART_DIMENSIONS = {
  width: 730,
  height: 310,
};

const L_CHART_DIMENSIONS = {
  width: 610,
  height: 310,
};

const MD_CHART_DIMENSIONS = {
  width: 440,
  height: 310,
};

const SM_CHART_DIMENSIONS = {
  width: 540,
  height: 310,
};

export const DownloadStatsChart = ({ downloadStatsRef }: StatsChartProps) => {
  const [data, setData] = useState<ChartsData[]>(generateInitialStackedData());

  const [storedData, setStoredData] = useState<StoredData>({
    totalDownloaded: 0,
    httpDownloaded: 0,
    p2pDownloaded: 0,
    p2pUploaded: 0,
  });

  const [svgDimensions, setSvgDimensions] = useState(XL_CHART_DIMENSIONS);

  const svgRef = useRef<SVGSVGElement>(null);

  const updateSvgDimensions = useCallback(() => {
    const clientWidth = document.documentElement.clientWidth;
    let newDimensions;

    if (clientWidth > 1200) {
      newDimensions = XL_CHART_DIMENSIONS;
    } else if (clientWidth > 992) {
      newDimensions = L_CHART_DIMENSIONS;
    } else if (clientWidth > 768) {
      newDimensions = MD_CHART_DIMENSIONS;
    } else if (clientWidth > 576) {
      newDimensions = SM_CHART_DIMENSIONS;
    } else {
      newDimensions = {
        width: clientWidth < 350 ? 320 : clientWidth - 30,
        height: 310,
      };
    }

    if (!newDimensions) return;

    setSvgDimensions(newDimensions);
  }, []);

  useEffect(() => {
    updateSvgDimensions();

    const intervalID = setInterval(() => {
      if (!downloadStatsRef.current) return;

      const { httpDownloaded, p2pDownloaded, p2pUploaded } =
        downloadStatsRef.current;

      setData((prevData: ChartsData[]) => {
        const newData: ChartsData = {
          seconds: Math.floor(performance.now() / 1000),
          httpDownloaded: convertToMbit(httpDownloaded),
          p2pDownloaded: convertToMbit(p2pDownloaded),
          p2pUploaded: convertToMbit(p2pUploaded * -1),
        };
        return [...prevData.slice(1), newData];
      });

      setStoredData((prevData) => ({
        totalDownloaded:
          prevData.totalDownloaded +
          convertToMiB(httpDownloaded + p2pDownloaded),
        httpDownloaded: prevData.httpDownloaded + convertToMiB(httpDownloaded),
        p2pDownloaded: prevData.p2pDownloaded + convertToMiB(p2pDownloaded),
        p2pUploaded: prevData.p2pUploaded + convertToMiB(p2pUploaded),
      }));

      downloadStatsRef.current.httpDownloaded = 0;
      downloadStatsRef.current.p2pDownloaded = 0;
      downloadStatsRef.current.p2pUploaded = 0;
    }, 1000);

    window.addEventListener("resize", updateSvgDimensions);

    return () => {
      clearInterval(intervalID);
      window.removeEventListener("resize", updateSvgDimensions);
    };
  }, [downloadStatsRef, updateSvgDimensions]);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = drawChart(svgRef.current, data);

    return () => {
      svg?.selectAll("*").remove();
    };
  }, [data, svgDimensions]);

  return (
    <div className="chart-container">
      <div className="legend-container">
        <ChartLegend
          legendItems={[
            {
              color: COLORS.torchRed,
              content: `Download - ${storedData.totalDownloaded.toFixed(2)} MiB `,
            },
            {
              color: COLORS.yellow,
              content: `- HTTP - ${storedData.httpDownloaded.toFixed(2)} MiB - ${calculatePercentage(storedData.httpDownloaded, storedData.totalDownloaded)}%`,
            },
            {
              color: COLORS.lightOrange,
              content: `- P2P - ${storedData.p2pDownloaded.toFixed(2)} MiB - ${calculatePercentage(storedData.p2pDownloaded, storedData.totalDownloaded)}%`,
            },
            {
              color: COLORS.lightBlue,
              content: `Upload P2P - ${storedData.p2pUploaded.toFixed(2)} MiB`,
            },
          ]}
        />
        <ChartLegend
          legendItems={[
            {
              color: COLORS.torchRed,
              content: `Download - ${data[data.length - 1].httpDownloaded.toFixed(2)} Mbit/s`,
            },
            {
              color: COLORS.yellow,
              content: `- HTTP - ${data[data.length - 1].httpDownloaded.toFixed(2)} Mbit/s`,
            },
            {
              color: COLORS.lightOrange,
              content: `- P2P - ${data[data.length - 1].p2pDownloaded.toFixed(2)} Mbit/s`,
            },
            {
              color: COLORS.lightBlue,
              content: `Upload P2P - ${(data[data.length - 1].p2pUploaded * -1).toFixed(2)} Mbit/s`,
            },
          ]}
        />
      </div>
      <svg
        ref={svgRef}
        width={svgDimensions.width}
        height={svgDimensions.height}
      />
    </div>
  );
};

import { ReactElement } from "react";

type LegendItem = {
  color: string;
  content: string | ReactElement;
};

type ChartLegendProps = {
  legendItems: LegendItem[];
};

export const ChartLegend = ({ legendItems }: ChartLegendProps) => {
  return (
    <div className="chart-legend">
      {legendItems.map((item, index) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={index} className="line">
          <div className="swatch" style={{ backgroundColor: item.color }} />
          <p>{item.content}</p>
        </div>
      ))}
    </div>
  );
};

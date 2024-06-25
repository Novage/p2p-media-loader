type LegendItem = {
  color: string;
  content: string | JSX.Element;
};

type ChartLegendProps = {
  legendItems: LegendItem[];
};

export const ChartLegend = ({ legendItems }: ChartLegendProps) => {
  return (
    <div className="chart-legend">
      {legendItems.map((item, index) => (
        <div key={index} className="line">
          <div className="swatch" style={{ backgroundColor: item.color }} />
          <p>{item.content}</p>
        </div>
      ))}
    </div>
  );
};

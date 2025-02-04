import { v4 } from "uuid";
import {
  AggType,
  BreakdownType,
  ChartTimeRangeType,
  EventCombination,
  LineChartGroupByTimeType,
  MetricMeasurement,
  PropOrigin,
} from "../../app-router-type";
import { ClickHouseQueryResponse, clickhouse } from "../../clickhouse";
import {
  InputMetric,
  MetricFilter,
} from "../../routes/charts/insight/eventFilterSchema";
import { InsightData } from "../../routes/charts/insight/getReport";
import { metricToEventLabel } from "./metricToEventLabel";
import { prepareFiltersAndBreakdown } from "./prepareFiltersAndBreakdown";
import { eventTime } from "../eventTime";
import { getAggFn } from "./getAggFn";

type BreakdownData = {
  id: string;
  eventLabel: string;
  measurement: MetricMeasurement;
  lineChartGroupByTimeType?: LineChartGroupByTimeType;
  breakdown?: BreakdownType;
  average_count: number;
  data: Record<string, number>;
};

export const queryLineChartMetric = async ({
  projectId,
  from,
  to,
  metric,
  breakdowns,
  timeRangeType,
  lineChartGroupByTimeType = LineChartGroupByTimeType.day,
  dateMap,
  globalFilters,
  timezone,
  dateHeaders,
}: {
  dateMap: Record<string, number>;
  dateHeaders: Array<{
    label: string;
    lookupValue: string;
  }>;
  globalFilters: MetricFilter[];
  projectId: string;
  from?: string;
  to?: string;
  timeRangeType: ChartTimeRangeType;
  breakdowns: MetricFilter[];
  combinations?: EventCombination[] | null;
  metric: InputMetric;
  lineChartGroupByTimeType?: LineChartGroupByTimeType;
  timezone: string;
}): Promise<BreakdownData[]> => {
  const isAggProp = metric.type === MetricMeasurement.aggProp;
  const {
    breakdownBucketMinMaxQuery,
    breakdownSelect,
    breakdownJoin,
    joinSection,
    query_params,
    whereSection,
  } = await prepareFiltersAndBreakdown({
    timezone,
    metric,
    globalFilters,
    breakdowns,
    projectId,
    timeRangeType,
    from,
    to,
    doPeopleJoin: isAggProp && metric.typeProp?.propOrigin === PropOrigin.user,
  });

  const isFrequency = metric.type === MetricMeasurement.frequencyPerUser;

  let query = `
  SELECT
      ${
        {
          [LineChartGroupByTimeType.day]: "toStartOfDay",
          [LineChartGroupByTimeType.week]: "toStartOfWeek",
          [LineChartGroupByTimeType.month]: "toStartOfMonth",
        }[lineChartGroupByTimeType]
      }(${eventTime(timezone)}${
        lineChartGroupByTimeType === LineChartGroupByTimeType.week ? `, 1` : ""
      }) AS day,
      ${
        isAggProp
          ? `${getAggFn(metric.typeAgg || AggType.avg)}(JSONExtractFloat(${metric.typeProp?.propOrigin === PropOrigin.user ? "p.properties" : "e.properties"}, {typeProp:String}))${
              metric.typeAgg === AggType.sumDivide100 ? "/100" : ""
            } as count`
          : `toInt32(count(${
              metric.type !== MetricMeasurement.uniqueUsers
                ? ``
                : `DISTINCT distinct_id`
            })) AS count`
      }
      ${breakdownSelect ? `, ${breakdownSelect}` : ""}
  FROM events as e${
    breakdownBucketMinMaxQuery ? `${breakdownBucketMinMaxQuery}` : ""
  }
  ${joinSection}
  ${breakdownJoin}
  WHERE ${whereSection}
  GROUP BY day
  ${isFrequency ? ",distinct_id" : ""}
  ${breakdownSelect ? ",breakdown" : ""}
  ORDER BY day ASC
`;
  if (isFrequency) {
    query = `
    select
    day,
    ${getAggFn(metric.typeAgg || AggType.avg)}(x.count)${
      metric.typeAgg === AggType.sumDivide100 ? "/100" : ""
    } as count
    ${breakdownSelect ? `,breakdown` : ""}
    from (${query}) as x
    group by day${breakdownSelect ? `,breakdown` : ""}
    order by day asc
    `;
  }
  if (breakdownSelect) {
    query = `
    select
    breakdown,
    round(sum(count) / ${dateHeaders.length}, 1) as average_count,
    groupArray((day, count)) as data
    from (${query})
    group by breakdown
    order by average_count desc
    limit 500
    `;
  }
  const resp = await clickhouse.query({
    query,
    query_params: {
      ...query_params,
      typeProp: metric.typeProp?.value,
    },
  });
  const { data } = await resp.json<ClickHouseQueryResponse<InsightData>>();
  const eventLabel = metricToEventLabel(metric);

  if (!data.length) {
    // No data
    return [];
  }

  if (breakdownSelect) {
    return (
      data as unknown as (BreakdownData & { data: [string, number][] })[]
    ).map((x) => {
      const dataMap: Record<string, number> = {};
      x.data.forEach((d) => {
        dataMap[d[0]] = d[1];
      });
      return {
        ...x,
        id: v4(),
        measurement: metric.type || MetricMeasurement.uniqueUsers,
        lineChartGroupByTimeType,
        eventLabel,
        data: {
          ...dateMap,
          ...dataMap,
        },
      };
    });
  } else {
    const dataMap: Record<string, number> = {};
    data.forEach((x) => {
      dataMap[x.day] = x.count;
    });

    return [
      {
        id: v4(),
        eventLabel,
        measurement: metric.type || MetricMeasurement.uniqueUsers,
        lineChartGroupByTimeType,
        average_count: !data.length
          ? 0
          : Math.round(
              (10 * data.reduce((a, b) => a + b.count, 0)) / dateHeaders.length
            ) / 10,
        data: {
          ...dateMap,
          ...dataMap,
        },
      },
    ];
  }
};

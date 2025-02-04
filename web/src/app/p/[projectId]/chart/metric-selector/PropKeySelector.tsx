import React, { useMemo } from "react";
import { MetricFilter } from "./Metric";
import { useProjectBoardContext } from "../../../../../../providers/ProjectBoardProvider";
import { RouterOutput, trpc } from "../../../../utils/trpc";
import Downshift from "downshift";
import { Input } from "../../../../ui/Input";
import { PulseLoader } from "../../../../ui/PulseLoader";
import {
  DataType,
  DateFilterOperation,
  NumberFilterOperation,
  PropOrigin,
  StringFilterOperation,
  defaultPropertyNameMap,
  hiddenPropertyNameMap,
} from "@voidpulse/api";
import { genId } from "../../../../utils/genId";
import { CiShoppingTag } from "react-icons/ci";
import { FaCalendarCheck } from "react-icons/fa6";
import { IoText } from "react-icons/io5";
import { LiaHashtagSolid } from "react-icons/lia";
import { TbCircleCheck, TbList } from "react-icons/tb";
import { RiArrowDropRightFill } from "react-icons/ri";
import { MetricEvent } from "./MetricSelector";

interface FilterSelectorProps {
  events: MetricEvent[];
  currProp?: {
    name: string;
    value: string;
  };
  onPropKey: (filter: Partial<MetricFilter>) => void;
}
const dataTypeIconStyle = "mr-2 opacity-40 my-auto";
export const dataTypeToIconMap = {
  [DataType.string]: <IoText className={dataTypeIconStyle} />,
  [DataType.number]: <LiaHashtagSolid className={dataTypeIconStyle} />,
  [DataType.date]: <FaCalendarCheck className={dataTypeIconStyle} />,
  [DataType.boolean]: <TbCircleCheck className={dataTypeIconStyle} />,
  [DataType.array]: <TbList className={dataTypeIconStyle} />,
  [DataType.other]: <CiShoppingTag className={dataTypeIconStyle} />,
};

export const PropKeySelector: React.FC<FilterSelectorProps> = ({
  onPropKey,
  events,
  currProp,
}) => {
  const { projectId } = useProjectBoardContext();
  // Fetch filter props for the specific event we're filtering out
  const { data, isLoading } = trpc.getPropKeys.useQuery({
    projectId,
    events,
  });
  const dataWithAutocompleteKey = useMemo(() => {
    if (data) {
      return {
        items: data.propDefs
          .filter((x) => !(x.key in hiddenPropertyNameMap))
          .map((x) => {
            const name =
              x.key in defaultPropertyNameMap
                ? defaultPropertyNameMap[
                    x.key as keyof typeof defaultPropertyNameMap
                  ]
                : x.key;
            return {
              ...x,
              name,
              value: x.key,
              lowercaseKey: name.toLowerCase(),
            };
          })
          .sort((a, b) => {
            const aIsDefaultProp = a.key in defaultPropertyNameMap;
            const bIsDefaultProp = b.key in defaultPropertyNameMap;
            if (aIsDefaultProp && !bIsDefaultProp) {
              return 1;
            }
            if (!aIsDefaultProp && bIsDefaultProp) {
              return -1;
            }
            return a.name.localeCompare(b.name);
          }),
      };
    }
    return null;
  }, [data]);

  return (
    <Downshift<NonNullable<typeof dataWithAutocompleteKey>["items"][0]>
      onChange={(selection) => {
        if (selection) {
          onPropKey({
            id: genId(),
            prop: {
              name: selection.name,
              value: selection.value,
            },
            propOrigin: selection.propOrigin,
            dataType: selection.type,
            operation: {
              [DataType.string]: StringFilterOperation.is,
              [DataType.number]: NumberFilterOperation.equals,
              [DataType.date]: DateFilterOperation.on,
              [DataType.boolean]: undefined,
              [DataType.array]: undefined,
              [DataType.other]: undefined,
            }[selection.type],
            value: selection.type === DataType.boolean ? true : undefined,
          });
        }
      }}
      itemToString={(item) => (item ? item.name : "")}
      defaultHighlightedIndex={0}
      initialIsOpen
    >
      {({
        getInputProps,
        getItemProps,
        getMenuProps,
        inputValue,
        highlightedIndex,
        selectedItem,
        getRootProps,
      }) => {
        return (
          <div
            style={{ width: 420, height: 360 }}
            className="bg-primary-900 border-primary-600 border shadow-xl flex flex-col p-4 rounded-md"
          >
            {/* Search bar at the top */}
            <div
              style={{ display: "inline-block" }}
              className="w-full"
              {...getRootProps({}, { suppressRefError: true })}
            >
              <Input {...getInputProps({ autoFocus: true })} />
            </div>

            {/* Shows the list of event names */}
            <div
              {...getMenuProps({
                className: "overflow-auto flex-1 mt-2",
              })}
            >
              {isLoading ? <PulseLoader pulseType="list" /> : null}
              {dataWithAutocompleteKey?.items
                .filter(
                  (item) =>
                    !inputValue ||
                    item.lowercaseKey.includes(inputValue.toLowerCase())
                )
                .map((item, index) => (
                  <div
                    key={item.name + item.propOrigin}
                    {...getItemProps({
                      index,
                      item,
                    })}
                    className={`flex flex-row p-2 rounded-md items-center
                    ${
                      item.value === currProp?.value
                        ? "bg-accent-100 text-primary-100"
                        : ""
                    }
                    ${
                      highlightedIndex === index
                        ? "bg-accent-100/30 text-accent-100"
                        : ""
                    }
                    ${highlightedIndex !== index ? "text-primary-100" : ""}
                    `}
                  >
                    {dataTypeToIconMap[item.type]}
                    {item.propOrigin === PropOrigin.user ? (
                      <>
                        <div className="text-sm opacity-70">User </div>
                        <RiArrowDropRightFill
                          className="opacity-70"
                          size={24}
                        />
                      </>
                    ) : null}
                    <div>{item.name}</div>
                  </div>
                ))}
            </div>
          </div>
        );
      }}
    </Downshift>
  );
};

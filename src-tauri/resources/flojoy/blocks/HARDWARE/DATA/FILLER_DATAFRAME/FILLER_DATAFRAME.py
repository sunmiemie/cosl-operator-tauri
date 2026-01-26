from typing import Optional
from flojoy import flojoy, DataFrame, DataContainer, String, Scalar, Boolean
import logging


@flojoy
def FILLER_DATAFRAME(
        df: DataFrame,
        results: Optional[list[DataContainer]] = None,
) -> DataFrame:
    logging.info(f"results:{results}")
    s_values = []
    if results is None:
        return DataFrame(df=df.m)

    # 转换目标列为object类型以支持混合数据类型
    target_col = df.m.columns[-1]
    df.m[target_col] = df.m[target_col].astype(object)

    for result in results:
        match result:
            case String():
                s_values.append(result.s)
            case Scalar():
                s_values.append(result.c)
            case Boolean():
                s_values.append("正常" if result.b else "异常")

    df.m.iloc[0: len(results), -1] = s_values
    return DataFrame(df=df.m)

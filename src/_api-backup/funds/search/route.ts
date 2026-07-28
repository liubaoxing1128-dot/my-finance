export const dynamic = "force-static";
import { NextRequest } from 'next/server';
import { success, error } from '@/lib/api-utils';
import type { FundSearchResult, FundType } from '@/types';

// GET /api/funds/search?keyword=000001
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const keyword = searchParams.get('keyword') || '';

    if (!keyword || keyword.length < 1) {
      return success([]);
    }

    const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(keyword)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://fund.eastmoney.com/' },
    });

    if (!resp.ok) {
      return error('搜索服务暂时不可用', 502);
    }

    const body = await resp.json();

    // 响应格式: { ErrCode: 0, Datas: [...] }
    if (!body.Datas || !Array.isArray(body.Datas)) {
      return success([]);
    }

    // 只保留基金类型
    const fundItems = body.Datas.filter(
      (item: any) => item.CATEGORYDESC === '基金' && item.CODE && item.NAME
    );

    const results: FundSearchResult[] = fundItems.slice(0, 10).map((item: any) => {
      const ftype = item.FundBaseInfo?.FTYPE || '';
      return {
        code: String(item.CODE),
        name: String(item.NAME),
        type: mapFundType(ftype),
      };
    });

    return success(results);
  } catch (e) {
    return error('搜索失败: ' + (e as Error).message, 500);
  }
}

function mapFundType(raw: string): FundType {
  if (/指数/.test(raw)) return 'index';
  if (/混合/.test(raw)) return 'mix';
  if (/债券|债/.test(raw)) return 'bond';
  if (/货币|货币/.test(raw)) return 'money';
  if (/QDII/.test(raw)) return 'qdi';
  if (/股票/.test(raw)) return 'stock';
  return 'other';
}

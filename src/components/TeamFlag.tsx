"use client";

/**
 * 国家队旗帜图片组件，使用 flagcdn.com 提供的真实旗帜。
 * 特殊地区（英格兰/苏格兰/威尔士）使用 flagcdn.com 的细分代码。
 */

const FLAG_CODES: Record<string, string> = {
  // 亚洲
  卡塔尔: "qa", 伊朗: "ir", 日本: "jp", 韩国: "kr", 沙特阿拉伯: "sa", 沙特: "sa",
  澳大利亚: "au", 伊拉克: "iq", 约旦: "jo", 乌兹别克斯坦: "uz",
  叙利亚: "sy", 阿联酋: "ae", 巴林: "bh", 科威特: "kw", 阿曼: "om",
  也门: "ye", 印度: "in", 中国: "cn", 朝鲜: "kp", 越南: "vn",
  泰国: "th", 印度尼西亚: "id", 菲律宾: "ph", 马来西亚: "my", 新加坡: "sg",

  // 欧洲
  英格兰: "gb-eng", 苏格兰: "gb-sct", 威尔士: "gb-wls",
  法国: "fr", 德国: "de", 西班牙: "es", 葡萄牙: "pt", 荷兰: "nl",
  比利时: "be", 克罗地亚: "hr", 丹麦: "dk", 瑞士: "ch", 奥地利: "at",
  瑞典: "se", 土耳其: "tr", 乌克兰: "ua", 波兰: "pl", 塞尔维亚: "rs", 匈牙利: "hu",
  捷克: "cz", 斯洛伐克: "sk", 罗马尼亚: "ro", 阿尔巴尼亚: "al",
  斯洛文尼亚: "si", 格鲁吉亚: "ge", 冰岛: "is", 芬兰: "fi",
  挪威: "no", 波黑: "ba", 黑山: "me", 北马其顿: "mk",
  希腊: "gr", 塞浦路斯: "cy", 爱尔兰: "ie", 卢森堡: "lu",
  俄罗斯: "ru", 白俄罗斯: "by", 以色列: "il",

  // 南美
  巴西: "br", 阿根廷: "ar", 哥伦比亚: "co", 乌拉圭: "uy", 厄瓜多尔: "ec",
  委内瑞拉: "ve", 秘鲁: "pe", 智利: "cl", 玻利维亚: "bo", 巴拉圭: "py",

  // 北美/中美/加勒比
  美国: "us", 墨西哥: "mx", 加拿大: "ca", 哥斯达黎加: "cr",
  巴拿马: "pa", 洪都拉斯: "hn", 牙买加: "jm", 海地: "ht",
  萨尔瓦多: "sv", 危地马拉: "gt", 古巴: "cu", 特立尼达和多巴哥: "tt",
  库拉索: "cw",

  // 非洲
  摩洛哥: "ma", 塞内加尔: "sn", 尼日利亚: "ng", 喀麦隆: "cm",
  埃及: "eg", 南非: "za", 科特迪瓦: "ci", 马里: "ml", 突尼斯: "tn",
  加纳: "gh", 刚果民主共和国: "cd", 佛得角: "cv", 赤道几内亚: "gq",
  加蓬: "ga", 津巴布韦: "zw", 坦桑尼亚: "tz", 赞比亚: "zm", 利比里亚: "lr",

  // 大洋洲
  新西兰: "nz",
};

export default function TeamFlag({
  name,
  size = 20,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const code = FLAG_CODES[name];
  if (!code) {
    return (
      <span
        className={`inline-block rounded-sm bg-raised text-center text-[10px] text-faint ${className}`}
        style={{ width: size, height: size * 0.75, lineHeight: `${size * 0.75}px` }}
      >
        ?
      </span>
    );
  }

  // flagcdn.com 支持 w20/w40/w80 三档
  const w = size <= 20 ? 20 : size <= 40 ? 40 : 80;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w${w}/${code}.png`}
      srcSet={`https://flagcdn.com/w${w * 2}/${code}.png 2x`}
      width={size}
      height={Math.round(size * 0.75)}
      alt={name}
      className={`inline-block rounded-sm object-cover ${className}`}
      loading="lazy"
    />
  );
}

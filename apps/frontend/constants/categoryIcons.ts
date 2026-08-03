import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import AutoStoriesOutlinedIcon from "@mui/icons-material/AutoStoriesOutlined";
import CakeOutlinedIcon from "@mui/icons-material/CakeOutlined";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import ContentCutOutlinedIcon from "@mui/icons-material/ContentCutOutlined";
import DirectionsBikeOutlinedIcon from "@mui/icons-material/DirectionsBikeOutlined";
import DirectionsBusOutlinedIcon from "@mui/icons-material/DirectionsBusOutlined";
import DirectionsCarOutlinedIcon from "@mui/icons-material/DirectionsCarOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import FamilyRestroomOutlinedIcon from "@mui/icons-material/FamilyRestroomOutlined";
import FitnessCenterOutlinedIcon from "@mui/icons-material/FitnessCenterOutlined";
import FlightOutlinedIcon from "@mui/icons-material/FlightOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import HealthAndSafetyOutlinedIcon from "@mui/icons-material/HealthAndSafetyOutlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import LocalCafeOutlinedIcon from "@mui/icons-material/LocalCafeOutlined";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import LuggageOutlinedIcon from "@mui/icons-material/LuggageOutlined";
import MedicalServicesOutlinedIcon from "@mui/icons-material/MedicalServicesOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import MoreHorizOutlinedIcon from "@mui/icons-material/MoreHorizOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import MusicNoteOutlinedIcon from "@mui/icons-material/MusicNoteOutlined";
import ParkOutlinedIcon from "@mui/icons-material/ParkOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PetsOutlinedIcon from "@mui/icons-material/PetsOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import RecordVoiceOverOutlinedIcon from "@mui/icons-material/RecordVoiceOverOutlined";
import RestaurantOutlinedIcon from "@mui/icons-material/RestaurantOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import ShoppingBagOutlinedIcon from "@mui/icons-material/ShoppingBagOutlined";
import SportsEsportsOutlinedIcon from "@mui/icons-material/SportsEsportsOutlined";
import SportsSoccerOutlinedIcon from "@mui/icons-material/SportsSoccerOutlined";
import TrainOutlinedIcon from "@mui/icons-material/TrainOutlined";
import WorkOutlineIcon from "@mui/icons-material/WorkOutline";
import type { SvgIconComponent } from "@mui/icons-material";

import {
  categoryIconValues,
  type CategoryIcon,
} from "../../../packages/schemas/category";

export const CATEGORY_ICON_COMPONENTS = {
  tag: LocalOfferOutlinedIcon,
  car: DirectionsCarOutlinedIcon,
  bicycle: DirectionsBikeOutlinedIcon,
  bus: DirectionsBusOutlinedIcon,
  train: TrainOutlinedIcon,
  flight: FlightOutlinedIcon,
  work: WorkOutlineIcon,
  school: SchoolOutlinedIcon,
  study: AutoStoriesOutlinedIcon,
  home: HomeOutlinedIcon,
  family: FamilyRestroomOutlinedIcon,
  friends: GroupsOutlinedIcon,
  event: EventOutlinedIcon,
  meeting: RecordVoiceOverOutlinedIcon,
  birthday: CakeOutlinedIcon,
  health: HealthAndSafetyOutlinedIcon,
  medical: MedicalServicesOutlinedIcon,
  fitness: FitnessCenterOutlinedIcon,
  sports: SportsSoccerOutlinedIcon,
  food: RestaurantOutlinedIcon,
  cafe: LocalCafeOutlinedIcon,
  shopping: ShoppingBagOutlinedIcon,
  money: PaymentsOutlinedIcon,
  bank: AccountBalanceOutlinedIcon,
  music: MusicNoteOutlinedIcon,
  movie: MovieOutlinedIcon,
  game: SportsEsportsOutlinedIcon,
  book: MenuBookOutlinedIcon,
  pet: PetsOutlinedIcon,
  beauty: ContentCutOutlinedIcon,
  phone: PhoneOutlinedIcon,
  computer: ComputerOutlinedIcon,
  outdoors: ParkOutlinedIcon,
  travel: LuggageOutlinedIcon,
  other: MoreHorizOutlinedIcon,
} satisfies Record<CategoryIcon, SvgIconComponent>;

const categoryIconLabels = {
  tag: "タグ",
  car: "車",
  bicycle: "自転車",
  bus: "バス",
  train: "電車",
  flight: "飛行機",
  work: "仕事",
  school: "学校",
  study: "勉強",
  home: "自宅",
  family: "家族",
  friends: "友人",
  event: "イベント",
  meeting: "会議・面談",
  birthday: "誕生日",
  health: "健康",
  medical: "病院",
  fitness: "トレーニング",
  sports: "スポーツ",
  food: "食事",
  cafe: "カフェ",
  shopping: "買い物",
  money: "支払い",
  bank: "銀行",
  music: "音楽",
  movie: "映画",
  game: "ゲーム",
  book: "読書",
  pet: "ペット",
  beauty: "美容",
  phone: "電話",
  computer: "パソコン",
  outdoors: "屋外",
  travel: "旅行",
  other: "その他",
} satisfies Record<CategoryIcon, string>;

export const CATEGORY_ICONS = categoryIconValues.map((value) => ({
  value,
  label: categoryIconLabels[value],
})) satisfies readonly {
  value: CategoryIcon;
  label: string;
}[];

export function getCategoryIcon(
  icon: CategoryIcon | null | undefined,
): SvgIconComponent {
  return CATEGORY_ICON_COMPONENTS[icon ?? "tag"];
}

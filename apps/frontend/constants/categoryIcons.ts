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

import type { CategoryIcon } from "../../../packages/schemas/category";

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

export const CATEGORY_ICONS = [
  { value: "tag", label: "タグ" },
  { value: "car", label: "車" },
  { value: "bicycle", label: "自転車" },
  { value: "bus", label: "バス" },
  { value: "train", label: "電車" },
  { value: "flight", label: "飛行機" },
  { value: "work", label: "仕事" },
  { value: "school", label: "学校" },
  { value: "study", label: "勉強" },
  { value: "home", label: "自宅" },
  { value: "family", label: "家族" },
  { value: "friends", label: "友人" },
  { value: "event", label: "イベント" },
  { value: "meeting", label: "会議・面談" },
  { value: "birthday", label: "誕生日" },
  { value: "health", label: "健康" },
  { value: "medical", label: "病院" },
  { value: "fitness", label: "トレーニング" },
  { value: "sports", label: "スポーツ" },
  { value: "food", label: "食事" },
  { value: "cafe", label: "カフェ" },
  { value: "shopping", label: "買い物" },
  { value: "money", label: "支払い" },
  { value: "bank", label: "銀行" },
  { value: "music", label: "音楽" },
  { value: "movie", label: "映画" },
  { value: "game", label: "ゲーム" },
  { value: "book", label: "読書" },
  { value: "pet", label: "ペット" },
  { value: "beauty", label: "美容" },
  { value: "phone", label: "電話" },
  { value: "computer", label: "パソコン" },
  { value: "outdoors", label: "屋外" },
  { value: "travel", label: "旅行" },
  { value: "other", label: "その他" },
] as const satisfies readonly {
  value: CategoryIcon;
  label: string;
}[];

export function getCategoryIcon(
  icon: CategoryIcon | null | undefined,
): SvgIconComponent {
  return CATEGORY_ICON_COMPONENTS[icon ?? "tag"];
}

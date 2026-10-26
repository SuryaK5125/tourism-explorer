import MuseumIcon from '@mui/icons-material/Museum'
import TempleHinduIcon from '@mui/icons-material/TempleHindu'
import TempleBuddhistIcon from '@mui/icons-material/TempleBuddhist'
import ChurchIcon from '@mui/icons-material/Church'
import MosqueIcon from '@mui/icons-material/Mosque'
import CastleIcon from '@mui/icons-material/Castle'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import ParkIcon from '@mui/icons-material/Park'
import LandscapeIcon from '@mui/icons-material/Landscape'
import PaletteIcon from '@mui/icons-material/Palette'
import AttractionsIcon from '@mui/icons-material/Attractions'
import PlaceIcon from '@mui/icons-material/Place'

// Most specific Geoapify category first. [category prefix, label, icon]
const KINDS = [
  ['heritage.unesco', 'UNESCO heritage', AccountBalanceIcon],
  ['entertainment.museum', 'Museum', MuseumIcon],
  ['entertainment.culture.gallery', 'Gallery', PaletteIcon],
  ['tourism.sights.place_of_worship.temple', 'Temple', TempleHinduIcon],
  ['tourism.sights.place_of_worship.shrine', 'Shrine', TempleBuddhistIcon],
  ['religion.place_of_worship.hinduism', 'Hindu temple', TempleHinduIcon],
  ['religion.place_of_worship.buddhism', 'Buddhist temple', TempleBuddhistIcon],
  ['religion.place_of_worship.sikhism', 'Gurdwara', TempleHinduIcon],
  ['religion.place_of_worship.shinto', 'Shinto shrine', TempleBuddhistIcon],
  ['tourism.sights.place_of_worship.mosque', 'Mosque', MosqueIcon],
  ['religion.place_of_worship.islam', 'Mosque', MosqueIcon],
  ['tourism.sights.place_of_worship.cathedral', 'Cathedral', ChurchIcon],
  ['tourism.sights.place_of_worship', 'Place of worship', ChurchIcon],
  ['religion.place_of_worship', 'Place of worship', ChurchIcon],
  ['tourism.sights.fort', 'Fort', CastleIcon],
  ['tourism.sights.castle', 'Castle', CastleIcon],
  ['tourism.sights.memorial.tomb', 'Tomb', AccountBalanceIcon],
  ['tourism.sights.memorial', 'Monument', AccountBalanceIcon],
  ['tourism.sights.archaeological_site', 'Archaeological site', AccountBalanceIcon],
  ['tourism.sights.ruines', 'Ruins', AccountBalanceIcon],
  ['tourism.sights.tower', 'Tower', AccountBalanceIcon],
  ['tourism.sights.bridge', 'Bridge', AccountBalanceIcon],
  ['tourism.attraction.viewpoint', 'Viewpoint', LandscapeIcon],
  ['tourism.attraction.artwork', 'Public art', PaletteIcon],
  ['natural', 'Nature', LandscapeIcon],
  ['leisure.park', 'Park', ParkIcon],
  ['heritage', 'Heritage site', AccountBalanceIcon],
  ['building.historic', 'Historic building', AccountBalanceIcon],
  ['tourism.sights', 'Sight', AttractionsIcon],
  ['tourism.attraction', 'Attraction', AttractionsIcon],
]

export function getPlaceKind(categories = []) {
  for (const [prefix, label, Icon] of KINDS) {
    if (categories.some((cat) => cat === prefix || cat.startsWith(prefix + '.'))) return { label, Icon }
  }
  return { label: 'Point of interest', Icon: PlaceIcon }
}

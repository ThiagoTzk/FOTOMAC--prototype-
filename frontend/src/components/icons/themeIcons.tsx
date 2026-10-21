import type { LucideIcon, LucideProps } from 'lucide-react-native';
import { createElement } from 'react';
import {
  Activity, Atom, Award, Baby, Bike, BookOpen, Brain, Briefcase, Bus, Cake, Calendar, Camera, Clapperboard, Code, Coffee, Cpu,
  Drama, Dumbbell, FlaskConical, Footprints, Gift, Globe, GraduationCap, Guitar, Handshake, Heart, HeartPulse, Hospital,
  Landmark, Laptop, Leaf, Lightbulb, Medal, Megaphone, Mic, Microscope, Music, Newspaper, Palette, PartyPopper, Pill, Plane,
  Presentation, Rocket, Scale, School, Sparkles, Star, Stethoscope, Sun, Tag, Trees, Trophy, Users, Utensils, Volleyball,
} from 'lucide-react-native';

/**
 * Symbols a photographer/administrator can give a theme (tag). The server stores only the NAME
 * (themes.icon, lucide's own name); this is the only place that turns it into a drawing, so an
 * unknown name — e.g. from a newer app version — is drawn as the default tag, never breaks.
 * Grouped only to make the picker easier to scan.
 */
export const THEME_ICONS: { name: string; label: string; Icon: LucideIcon; group: string }[] = [
  { group: 'Acadêmico', name: 'graduation-cap', label: 'Formatura', Icon: GraduationCap },
  { group: 'Acadêmico', name: 'book-open', label: 'Livro', Icon: BookOpen },
  { group: 'Acadêmico', name: 'school', label: 'Escola', Icon: School },
  { group: 'Acadêmico', name: 'presentation', label: 'Apresentação', Icon: Presentation },
  { group: 'Acadêmico', name: 'mic', label: 'Palestra', Icon: Mic },
  { group: 'Acadêmico', name: 'megaphone', label: 'Anúncio', Icon: Megaphone },
  { group: 'Acadêmico', name: 'newspaper', label: 'Imprensa', Icon: Newspaper },
  { group: 'Acadêmico', name: 'award', label: 'Premiação', Icon: Award },
  { group: 'Ciência e tecnologia', name: 'flask-conical', label: 'Ciência', Icon: FlaskConical },
  { group: 'Ciência e tecnologia', name: 'microscope', label: 'Laboratório', Icon: Microscope },
  { group: 'Ciência e tecnologia', name: 'atom', label: 'Física', Icon: Atom },
  { group: 'Ciência e tecnologia', name: 'cpu', label: 'Tecnologia', Icon: Cpu },
  { group: 'Ciência e tecnologia', name: 'laptop', label: 'Computação', Icon: Laptop },
  { group: 'Ciência e tecnologia', name: 'code', label: 'Programação', Icon: Code },
  { group: 'Ciência e tecnologia', name: 'rocket', label: 'Inovação', Icon: Rocket },
  { group: 'Ciência e tecnologia', name: 'lightbulb', label: 'Ideia', Icon: Lightbulb },
  { group: 'Ciência e tecnologia', name: 'brain', label: 'Psicologia', Icon: Brain },
  { group: 'Saúde', name: 'heart-pulse', label: 'Saúde', Icon: HeartPulse },
  { group: 'Saúde', name: 'stethoscope', label: 'Medicina', Icon: Stethoscope },
  { group: 'Saúde', name: 'hospital', label: 'Hospital', Icon: Hospital },
  { group: 'Saúde', name: 'pill', label: 'Farmácia', Icon: Pill },
  { group: 'Saúde', name: 'activity', label: 'Fisioterapia', Icon: Activity },
  { group: 'Saúde', name: 'baby', label: 'Pediatria', Icon: Baby },
  { group: 'Esporte', name: 'trophy', label: 'Esporte', Icon: Trophy },
  { group: 'Esporte', name: 'medal', label: 'Medalha', Icon: Medal },
  { group: 'Esporte', name: 'dumbbell', label: 'Academia', Icon: Dumbbell },
  { group: 'Esporte', name: 'volleyball', label: 'Vôlei', Icon: Volleyball },
  { group: 'Esporte', name: 'bike', label: 'Ciclismo', Icon: Bike },
  { group: 'Esporte', name: 'footprints', label: 'Corrida', Icon: Footprints },
  { group: 'Cultura', name: 'palette', label: 'Artes', Icon: Palette },
  { group: 'Cultura', name: 'music', label: 'Música', Icon: Music },
  { group: 'Cultura', name: 'guitar', label: 'Show', Icon: Guitar },
  { group: 'Cultura', name: 'drama', label: 'Teatro', Icon: Drama },
  { group: 'Cultura', name: 'clapperboard', label: 'Cinema', Icon: Clapperboard },
  { group: 'Cultura', name: 'camera', label: 'Fotografia', Icon: Camera },
  { group: 'Convivência', name: 'party-popper', label: 'Festa', Icon: PartyPopper },
  { group: 'Convivência', name: 'cake', label: 'Aniversário', Icon: Cake },
  { group: 'Convivência', name: 'gift', label: 'Presente', Icon: Gift },
  { group: 'Convivência', name: 'users', label: 'Pessoas', Icon: Users },
  { group: 'Convivência', name: 'handshake', label: 'Parceria', Icon: Handshake },
  { group: 'Convivência', name: 'utensils', label: 'Gastronomia', Icon: Utensils },
  { group: 'Convivência', name: 'coffee', label: 'Café', Icon: Coffee },
  { group: 'Convivência', name: 'heart', label: 'Solidariedade', Icon: Heart },
  { group: 'Institucional', name: 'landmark', label: 'Institucional', Icon: Landmark },
  { group: 'Institucional', name: 'briefcase', label: 'Carreira', Icon: Briefcase },
  { group: 'Institucional', name: 'scale', label: 'Direito', Icon: Scale },
  { group: 'Institucional', name: 'globe', label: 'Internacional', Icon: Globe },
  { group: 'Institucional', name: 'leaf', label: 'Meio ambiente', Icon: Leaf },
  { group: 'Institucional', name: 'trees', label: 'Ao ar livre', Icon: Trees },
  { group: 'Institucional', name: 'sun', label: 'Verão', Icon: Sun },
  { group: 'Institucional', name: 'plane', label: 'Viagem', Icon: Plane },
  { group: 'Institucional', name: 'bus', label: 'Excursão', Icon: Bus },
  { group: 'Institucional', name: 'calendar', label: 'Agenda', Icon: Calendar },
  { group: 'Institucional', name: 'star', label: 'Destaque', Icon: Star },
  { group: 'Institucional', name: 'sparkles', label: 'Especial', Icon: Sparkles },
  { group: 'Institucional', name: 'tag', label: 'Etiqueta', Icon: Tag },
];

const BY_NAME = new Map(THEME_ICONS.map((i) => [i.name, i.Icon]));

/** Drawing for a stored icon name; the default tag when the name is unknown or empty. */
export function themeIcon(name?: string | null): LucideIcon {
  return (name && BY_NAME.get(name)) || Tag;
}

/**
 * <ThemeIcon name="trophy" size={20} color=… /> — the symbol of a theme. The drawing is one of
 * the module-level icons above, picked by name (createElement, so the React Compiler does not
 * mistake the lookup for a component created during render).
 */
export function ThemeIcon({ name, ...props }: { name?: string | null } & LucideProps) {
  return createElement(themeIcon(name), props);
}

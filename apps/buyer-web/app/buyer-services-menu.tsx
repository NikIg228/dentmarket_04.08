"use client";

import {
  Button,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
} from "@fluentui/react-components";
import { Bot24Regular } from "@fluentui/react-icons/svg/bot";
import { Location24Regular } from "@fluentui/react-icons/svg/location";
import { MoreHorizontal24Regular } from "@fluentui/react-icons/svg/more-horizontal";
import { PersonSupport24Regular } from "@fluentui/react-icons/svg/person-support";
import { frontendFeatures } from "@marketplace/api-client";

export function BuyerServicesMenu({
  onNavigate,
}: {
  onNavigate: (section: string) => void;
}) {
  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button appearance="subtle" icon={<MoreHorizontal24Regular />}>
          Сервисы
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {frontendFeatures.recommendations && (
            <MenuItem
              icon={<Location24Regular />}
              onClick={() => onNavigate("smart-commerce")}
            >
              Рекомендации по городу
            </MenuItem>
          )}
          {frontendFeatures.ai && (
            <MenuItem
              icon={<Bot24Regular />}
              onClick={() => onNavigate("assistant")}
            >
              AI-помощник
            </MenuItem>
          )}
          <MenuItem
            icon={<PersonSupport24Regular />}
            onClick={() => onNavigate("support")}
          >
            Поддержка
          </MenuItem>
          <MenuItem onClick={() => window.location.assign("/about")}>
            О DentMarket
          </MenuItem>
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}

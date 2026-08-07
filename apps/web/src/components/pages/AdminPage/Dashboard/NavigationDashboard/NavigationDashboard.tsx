import { NavLink } from "react-router-dom"
import type { NavigationDashboardProps } from "./TypesNavigationDashboard"

export const NavigationDashboard = ({ navItems }: NavigationDashboardProps) => {
    return (
        <aside  className="navigation_dashboard">
            <div className="navigation_dashboard__container">
                <nav className="navigation_dashboard__nav">
                    <ul className="navigation_dashboard__list">
                        {navItems?.map((item) => (
                            <li key={item.to} className="navigation_dashboard__list-item">
                                <NavLink
                                    to={item.to}
                                    className={({ isActive }) =>
                                        isActive
                                            ? 'navigation_dashboard__item navigation_dashboard__item--active'
                                            : 'navigation_dashboard__item'
                                    }
                                >
                                    {item.label}
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>
        </aside>

    )

}
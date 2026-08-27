// Congress - Main Application

(function () {
  // ===================
  // Committee Tree
  // ===================

  let allCommittees = [];
  let committeesById = new Map();

  async function loadCommittees() {
    try {
      const res = await fetch('data/committees.json');
      allCommittees = await res.json();
      
      // Build lookup by id
      committeesById = new Map(allCommittees.map(c => [c.id, c]));

      // Initial render with default filter (senate)
      renderFilteredCommittees('senate');

      // Listen for filter changes
      document.querySelectorAll('input[name="chamber"]').forEach(radio => {
        radio.addEventListener('change', e => {
          renderFilteredCommittees(e.target.value);
        });
      });

    } catch (err) {
      const container = document.querySelector('#committees .panel-content');
      container.innerHTML = '<p class="load-error">Failed to load committees.<br><small>Try running a local server (fetch doesn\'t work with file:// URLs)</small></p>';
      console.error(err);
    }
  }

  function renderFilteredCommittees(chamberFilter) {
    const container = document.querySelector('#committees .panel-content');
    container.innerHTML = '';

    // Filter committees by chamber
    const filtered = allCommittees.filter(c => {
      if (chamberFilter === 'both') {
        return c.chamber === 'senate' || c.chamber === 'house';
      }
      return c.chamber === chamberFilter;
    });

    // Get all valid IDs including ancestors
    const validIds = new Set();
    filtered.forEach(c => {
      validIds.add(c.id);
      // Add ancestors so parent committees show even if they don't match filter
      let parentId = c.parent_committee_id;
      const seen = new Set();
      while (parentId && !seen.has(parentId)) {
        seen.add(parentId);
        validIds.add(parentId);
        const parent = committeesById.get(parentId);
        parentId = parent ? parent.parent_committee_id : null;
      }
    });

    // Build parent -> children map for filtered set
    const childrenOf = new Map();
    allCommittees.forEach(c => {
      if (!validIds.has(c.id)) return;
      // Treat self-referential parent as root
      const parentId = (c.parent_committee_id === c.id) ? null : (c.parent_committee_id ?? null);
      if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
      childrenOf.get(parentId).push(c);
    });

    // Sort children alphabetically
    for (const [, children] of childrenOf) {
      children.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Render tree
    const tree = document.createElement('ul');
    tree.className = 'committee-tree';
    renderTreeNodes(childrenOf, null, tree);
    container.appendChild(tree);

    // Update count (only committees that match the filter, not ancestors added for tree structure)
    document.getElementById('committee-count').textContent = filtered.length;
  }

  function renderTreeNodes(childrenOf, parentId, parentEl) {
    const children = childrenOf.get(parentId) || [];

    for (const committee of children) {
      const hasChildren = childrenOf.has(committee.id);
      
      const li = document.createElement('li');
      li.className = 'tree-node';

      const item = document.createElement('div');
      item.className = 'tree-item' + (hasChildren ? ' expandable' : '');
      item.dataset.id = committee.id;

      if (hasChildren) {
        const toggle = document.createElement('span');
        toggle.className = 'toggle';
        item.appendChild(toggle);
      }

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = committee.name;
      item.appendChild(name);

      li.appendChild(item);

      if (hasChildren) {
        const childrenUl = document.createElement('ul');
        childrenUl.className = 'children';
        renderTreeNodes(childrenOf, committee.id, childrenUl);
        li.appendChild(childrenUl);
      }

      // Click on name selects the committee
      name.addEventListener('click', e => {
        e.stopPropagation();
        selectCommittee(committee);
      });

      // Click on toggle (or item for expandable) toggles expand/collapse
      if (hasChildren) {
        item.addEventListener('click', () => {
          li.classList.toggle('collapsed');
        });
      }

      parentEl.appendChild(li);
    }
  }

  let selectedCommitteeId = null;

  function updateCommitteeClearButton() {
    const btn = document.getElementById('committee-clear');
    if (btn) {
      btn.classList.toggle('hidden', !selectedCommitteeId);
    }
  }

  function clearCommitteeSelection() {
    document.querySelectorAll('.tree-item.selected').forEach(el => {
      el.classList.remove('selected');
    });
    selectedCommitteeId = null;
    updateCommitteeClearButton();
    renderFilteredMembers();
  }

  function selectCommittee(committee) {
    // Remove existing selection
    document.querySelectorAll('.tree-item.selected').forEach(el => {
      el.classList.remove('selected');
    });

    // Highlight selected item
    const treeItem = document.querySelector(`.tree-item[data-id="${committee.id}"]`);
    if (treeItem) {
      treeItem.classList.add('selected');
    }

    // Update selected committee and refresh members list
    selectedCommitteeId = committee.id;
    updateCommitteeClearButton();
    renderFilteredMembers();
  }

  // ===================
  // Committee Search
  // ===================

  let searchIndex = -1;
  let searchResults = [];

  function setupSearch() {
    const input = document.getElementById('committee-search');
    const resultsEl = document.getElementById('committee-search-results');

    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      searchIndex = -1;

      if (query.length < 3) {
        resultsEl.innerHTML = '';
        resultsEl.classList.remove('visible');
        return;
      }

      const chamberFilter = document.querySelector('input[name="chamber"]:checked').value;
      
      // Filter by chamber and search query
      searchResults = allCommittees.filter(c => {
        const matchesChamber = chamberFilter === 'both' 
          ? (c.chamber === 'senate' || c.chamber === 'house')
          : c.chamber === chamberFilter;
        return matchesChamber && c.name.toLowerCase().includes(query);
      }).slice(0, 10);

      renderSearchResults(query);
    });

    input.addEventListener('keydown', e => {
      if (!resultsEl.classList.contains('visible')) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        searchIndex = Math.min(searchIndex + 1, searchResults.length - 1);
        updateSearchSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        searchIndex = Math.max(searchIndex - 1, 0);
        updateSearchSelection();
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        if (searchIndex >= 0 && searchResults[searchIndex]) {
          e.preventDefault();
          selectSearchResult(searchResults[searchIndex]);
        }
      } else if (e.key === 'Escape') {
        resultsEl.innerHTML = '';
        resultsEl.classList.remove('visible');
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        resultsEl.classList.remove('visible');
      }, 150);
    });

    input.addEventListener('focus', () => {
      if (searchResults.length > 0 && input.value.trim().length >= 3) {
        resultsEl.classList.add('visible');
      }
    });
  }

  function renderSearchResults(query) {
    const resultsEl = document.getElementById('committee-search-results');
    resultsEl.innerHTML = '';

    if (searchResults.length === 0) {
      resultsEl.classList.remove('visible');
      return;
    }

    searchResults.forEach((c, i) => {
      const li = document.createElement('li');
      li.className = 'search-result';
      li.innerHTML = highlightMatch(c.name, query);
      li.addEventListener('click', () => selectSearchResult(c));
      li.addEventListener('mouseenter', () => {
        searchIndex = i;
        updateSearchSelection();
      });
      resultsEl.appendChild(li);
    });

    resultsEl.classList.add('visible');
  }

  function highlightMatch(text, query) {
    const idx = text.toLowerCase().indexOf(query);
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length);
    return `${before}<mark>${match}</mark>${after}`;
  }

  function updateSearchSelection() {
    const resultsEl = document.getElementById('committee-search-results');
    const items = resultsEl.querySelectorAll('.search-result');
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === searchIndex);
    });
  }

  function selectSearchResult(committee) {
    const input = document.getElementById('committee-search');
    const resultsEl = document.getElementById('committee-search-results');
    
    input.value = '';
    resultsEl.innerHTML = '';
    resultsEl.classList.remove('visible');
    searchResults = [];
    searchIndex = -1;

    // Expand tree to show selected committee
    expandToCommittee(committee.id);
    
    // Select the committee
    selectCommittee(committee);
  }

  function expandToCommittee(committeeId) {
    // Find the tree item and expand all ancestors
    const treeItem = document.querySelector(`.tree-item[data-id="${committeeId}"]`);
    if (!treeItem) return;

    // Expand all ancestor nodes
    let node = treeItem.closest('.tree-node');
    while (node) {
      node.classList.remove('collapsed');
      const parent = node.parentElement.closest('.tree-node');
      node = parent;
    }

    // Scroll into view
    treeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ===================
  // Members List
  // ===================

  let allMembers = [];
  let membersById = new Map();
  let committeeMemberships = [];
  let memberIdsByCommittee = new Map();
  let membershipDetails = new Map();
  let membershipsByMemberId = new Map();

  let allStaff = [];
  let staffByMemberId = new Map();
  let allOffices = [];
  let officesByMemberId = new Map();

  async function loadMembers() {
    try {
      const [membersRes, membershipsRes, staffRes, officesRes] = await Promise.all([
        fetch('data/members.json'),
        fetch('data/committee_memberships.json'),
        fetch('data/staff.json'),
        fetch('data/offices.json')
      ]);
      
      const membersRaw = await membersRes.json();
      committeeMemberships = await membershipsRes.json();
      allStaff = await staffRes.json();
      allOffices = await officesRes.json();

      // Filter out invalid members (no name)
      allMembers = membersRaw.filter(m => m.first_name || m.last_name);

      // Build lookup by id
      membersById = new Map(allMembers.map(m => [m.id, m]));

      // Build committee -> member ids map and membership details lookup
      memberIdsByCommittee = new Map();
      membershipDetails = new Map();
      membershipsByMemberId = new Map();
      committeeMemberships.forEach(cm => {
        if (!memberIdsByCommittee.has(cm.committee_id)) {
          memberIdsByCommittee.set(cm.committee_id, []);
        }
        memberIdsByCommittee.get(cm.committee_id).push(cm.member_id);
        
        // Store membership details keyed by "committee_id-member_id"
        const key = `${cm.committee_id}-${cm.member_id}`;
        membershipDetails.set(key, { role: cm.role, rank: cm.rank });

        if (!membershipsByMemberId.has(cm.member_id)) {
          membershipsByMemberId.set(cm.member_id, []);
        }
        membershipsByMemberId.get(cm.member_id).push(cm);
      });

      staffByMemberId = new Map();
      allStaff.forEach(s => {
        if (!s.member_id) return;
        if (!staffByMemberId.has(s.member_id)) {
          staffByMemberId.set(s.member_id, []);
        }
        staffByMemberId.get(s.member_id).push(s);
      });
      for (const [, staffList] of staffByMemberId) {
        staffList.sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));
      }

      officesByMemberId = new Map();
      allOffices.forEach(o => {
        if (!o.member_id) return;
        if (!officesByMemberId.has(o.member_id)) {
          officesByMemberId.set(o.member_id, []);
        }
        officesByMemberId.get(o.member_id).push(o);
      });
      for (const [, officeList] of officesByMemberId) {
        officeList.sort((a, b) => {
          const cityDiff = (a.city || '').localeCompare(b.city || '');
          if (cityDiff !== 0) return cityDiff;
          return (a.suite || '').localeCompare(b.suite || '');
        });
      }

      // Initial render
      renderFilteredMembers();

      // Listen for party filter changes
      document.querySelectorAll('input[name="party"]').forEach(radio => {
        radio.addEventListener('change', () => {
          renderFilteredMembers();
        });
      });

    } catch (err) {
      const container = document.querySelector('#members .panel-content');
      container.innerHTML = '<p class="load-error">Failed to load members.<br><small>Try running a local server (fetch doesn\'t work with file:// URLs)</small></p>';
      console.error(err);
    }
  }

  function getFilteredMembers() {
    if (allMembers.length === 0) return [];

    const partyFilter = document.querySelector('input[name="party"]:checked').value;

    let filtered = allMembers;

    if (selectedCommitteeId) {
      const memberIds = memberIdsByCommittee.get(selectedCommitteeId) || [];
      const memberIdSet = new Set(memberIds);
      filtered = allMembers.filter(m => memberIdSet.has(m.id));
    }

    if (partyFilter !== 'all') {
      filtered = filtered.filter(m => m.party_code === partyFilter);
    }

    const partyOrder = { R: 0, D: 1, I: 2 };
    filtered.sort((a, b) => {
      const partyDiff = (partyOrder[a.party_code] ?? 3) - (partyOrder[b.party_code] ?? 3);
      if (partyDiff !== 0) return partyDiff;

      if (selectedCommitteeId) {
        const aKey = `${selectedCommitteeId}-${a.id}`;
        const bKey = `${selectedCommitteeId}-${b.id}`;
        const aRank = membershipDetails.get(aKey)?.rank ?? 999;
        const bRank = membershipDetails.get(bKey)?.rank ?? 999;
        return aRank - bRank;
      }

      return (a.last_name || '').localeCompare(b.last_name || '');
    });

    return filtered;
  }

  function renderFilteredMembers() {
    const container = document.querySelector('#members .panel-content');
    container.innerHTML = '';

    const filtered = getFilteredMembers();
    if (allMembers.length === 0) return;
    const ul = document.createElement('ul');
    ul.className = 'member-list';

    for (const member of filtered) {
      const li = document.createElement('li');
      li.className = 'member-item';
      li.dataset.id = member.id;

      const name = document.createElement('span');
      name.className = 'member-name';
      name.textContent = `${member.first_name || ''} ${member.last_name || ''}`.trim();

      // Show rank and role if viewing a committee
      if (selectedCommitteeId) {
        const key = `${selectedCommitteeId}-${member.id}`;
        const details = membershipDetails.get(key);
        if (details) {
          if (details.rank) {
            const rank = document.createElement('span');
            rank.className = 'member-rank';
            rank.textContent = `#${details.rank}`;
            name.appendChild(rank);
          }
          if (details.role) {
            const role = document.createElement('span');
            role.className = 'member-role';
            role.textContent = details.role;
            name.appendChild(role);
          }
        }
      }

      const party = document.createElement('span');
      party.className = `member-party party-${member.party_code}`;
      party.textContent = member.party_code;

      const state = document.createElement('span');
      state.className = 'member-state';
      state.textContent = member.state_code;

      li.appendChild(party);
      li.appendChild(name);
      li.appendChild(state);

      li.addEventListener('click', () => selectMember(member));

      ul.appendChild(li);
    }

    container.appendChild(ul);

    // Update count
    document.getElementById('member-count').textContent = filtered.length;

    // Always keep a member selected when the list has entries
    if (filtered.length > 0) {
      const keep = filtered.find(m => m.id === selectedMemberId);
      selectMember(keep || filtered[0]);
    } else {
      clearMemberDetail();
    }
  }

  function renderStaffTable(memberId) {
    const wrap = document.getElementById('staff-table-wrap');
    const countEl = document.getElementById('staff-table-count');
    wrap.innerHTML = '';

    if (!memberId) {
      countEl.textContent = '';
      wrap.innerHTML = '<p class="placeholder-text">Select a member to view staff</p>';
      return;
    }

    const staff = staffByMemberId.get(memberId) || [];
    countEl.textContent = String(staff.length);

    if (staff.length === 0) {
      wrap.innerHTML = '<p class="placeholder-text">No staff on file for this member</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'staff-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Name', 'Title', 'Email', 'Phone', 'Office'].forEach(label => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const person of staff) {
      const tr = document.createElement('tr');

      const nameCell = document.createElement('td');
      nameCell.textContent = `${person.first_name || ''} ${person.last_name || ''}`.trim();
      tr.appendChild(nameCell);

      const titleCell = document.createElement('td');
      titleCell.textContent = person.title || '';
      tr.appendChild(titleCell);

      const emailCell = document.createElement('td');
      if (person.email) {
        const emailLink = document.createElement('a');
        emailLink.href = `mailto:${person.email}`;
        emailLink.textContent = person.email;
        emailCell.appendChild(emailLink);
      }
      tr.appendChild(emailCell);

      const phoneCell = document.createElement('td');
      phoneCell.textContent = person.phone || '';
      tr.appendChild(phoneCell);

      const officeCell = document.createElement('td');
      officeCell.textContent = person.office_location || '';
      tr.appendChild(officeCell);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function renderCommitteesTable(memberId) {
    const wrap = document.getElementById('member-committees-wrap');
    const countEl = document.getElementById('member-committees-count');
    wrap.innerHTML = '';

    if (!memberId) {
      countEl.textContent = '';
      wrap.innerHTML = '<p class="placeholder-text">Select a member to view committees</p>';
      return;
    }

    const memberships = (membershipsByMemberId.get(memberId) || [])
      .map(cm => {
        const committee = committeesById.get(cm.committee_id);
        if (!committee) return null;
        const parentId = (committee.parent_committee_id && committee.parent_committee_id !== committee.id)
          ? committee.parent_committee_id
          : null;
        const parent = parentId ? committeesById.get(parentId) : null;
        return {
          committee,
          parentName: parent ? parent.name : '',
          role: cm.role || '',
          rank: cm.rank,
          isSubcommittee: Boolean(parentId)
        };
      })
      .filter(Boolean);

    memberships.sort((a, b) => {
      const aGroup = a.isSubcommittee ? (a.parentName || a.committee.name) : a.committee.name;
      const bGroup = b.isSubcommittee ? (b.parentName || b.committee.name) : b.committee.name;
      const groupDiff = aGroup.localeCompare(bGroup);
      if (groupDiff !== 0) return groupDiff;
      if (a.isSubcommittee !== b.isSubcommittee) return a.isSubcommittee ? 1 : -1;
      return a.committee.name.localeCompare(b.committee.name);
    });

    countEl.textContent = String(memberships.length);

    if (memberships.length === 0) {
      wrap.innerHTML = '<p class="placeholder-text">No committee assignments on file</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'staff-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Committee', 'Rank'].forEach(label => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of memberships) {
      const tr = document.createElement('tr');
      tr.className = 'committee-row';

      const nameCell = document.createElement('td');
      if (row.isSubcommittee) nameCell.classList.add('committee-sub');
      nameCell.appendChild(document.createTextNode(row.committee.name));
      if (row.role) {
        const role = document.createElement('span');
        role.className = 'member-role';
        role.textContent = row.role;
        nameCell.appendChild(role);
      }
      tr.appendChild(nameCell);

      const rankCell = document.createElement('td');
      rankCell.textContent = row.rank != null ? String(row.rank) : '';
      tr.appendChild(rankCell);

      tr.addEventListener('click', () => {
        applyCommitteeFilterFromMember(row.committee);
      });

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function formatOfficeAddress(office) {
    const lines = [];
    if (office.building) lines.push(office.building);
    if (office.suite) lines.push(office.suite);
    const cityStateZip = [
      office.city,
      [office.state, office.zip].filter(Boolean).join(' ')
    ].filter(Boolean).join(', ');
    if (cityStateZip) lines.push(cityStateZip);
    return lines;
  }

  function renderOffices(memberId) {
    const wrap = document.getElementById('offices-table-wrap');
    const countEl = document.getElementById('offices-table-count');
    wrap.innerHTML = '';

    if (!memberId) {
      countEl.textContent = '';
      wrap.innerHTML = '<p class="placeholder-text">Select a member to view offices</p>';
      return;
    }

    const offices = officesByMemberId.get(memberId) || [];
    countEl.textContent = String(offices.length);

    if (offices.length === 0) {
      wrap.innerHTML = '<p class="placeholder-text">No offices on file for this member</p>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'office-list';

    for (const office of offices) {
      const card = document.createElement('div');
      card.className = 'office-card';

      const address = document.createElement('p');
      address.className = 'office-address';
      const lines = formatOfficeAddress(office);
      lines.forEach((line, i) => {
        if (i > 0) address.appendChild(document.createElement('br'));
        address.appendChild(document.createTextNode(line));
      });
      if (lines.length) card.appendChild(address);

      const contacts = document.createElement('dl');
      contacts.className = 'office-contact';
      let hasContact = false;

      if (office.phone) {
        hasContact = true;
        const dt = document.createElement('dt');
        dt.textContent = 'Phone';
        const dd = document.createElement('dd');
        const link = document.createElement('a');
        link.href = `tel:${office.phone}`;
        link.textContent = office.phone;
        dd.appendChild(link);
        contacts.appendChild(dt);
        contacts.appendChild(dd);
      }

      if (office.fax) {
        hasContact = true;
        const dt = document.createElement('dt');
        dt.textContent = 'Fax';
        const dd = document.createElement('dd');
        dd.textContent = office.fax;
        contacts.appendChild(dt);
        contacts.appendChild(dd);
      }

      if (office.hours) {
        hasContact = true;
        const dt = document.createElement('dt');
        dt.textContent = 'Hours';
        const dd = document.createElement('dd');
        dd.textContent = office.hours;
        contacts.appendChild(dt);
        contacts.appendChild(dd);
      }

      if (hasContact) card.appendChild(contacts);
      list.appendChild(card);
    }

    wrap.appendChild(list);
  }

  function applyCommitteeFilterFromMember(committee) {
    const currentChamber = document.querySelector('input[name="chamber"]:checked').value;
    if (currentChamber !== 'both' && currentChamber !== committee.chamber) {
      const radio = document.querySelector(`input[name="chamber"][value="${committee.chamber}"]`);
      if (radio) {
        radio.checked = true;
        renderFilteredCommittees(committee.chamber);
      }
    }

    expandToCommittee(committee.id);
    selectCommittee(committee);
  }

  function setupMemberTabs() {
    document.querySelectorAll('.member-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const name = tab.dataset.tab;
        document.querySelectorAll('.member-tab').forEach(t => {
          const active = t.dataset.tab === name;
          t.classList.toggle('active', active);
          t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        document.querySelectorAll('.member-tab-panel').forEach(panel => {
          panel.classList.toggle('hidden', panel.dataset.panel !== name);
        });
      });
    });
  }

  // ===================
  // Member Search
  // ===================

  let memberSearchIndex = -1;
  let memberSearchResults = [];

  function setupMemberSearch() {
    const input = document.getElementById('member-search');
    const resultsEl = document.getElementById('member-search-results');

    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      memberSearchIndex = -1;

      if (query.length < 3) {
        resultsEl.innerHTML = '';
        resultsEl.classList.remove('visible');
        return;
      }

      const partyFilter = document.querySelector('input[name="party"]:checked').value;

      memberSearchResults = allMembers.filter(m => {
        const matchesParty = partyFilter === 'all' || m.party_code === partyFilter;
        const fullName = `${m.first_name} ${m.last_name}`.toLowerCase();
        const reverseName = `${m.last_name}, ${m.first_name}`.toLowerCase();
        return matchesParty && (fullName.includes(query) || reverseName.includes(query));
      }).slice(0, 10);

      renderMemberSearchResults(query);
    });

    input.addEventListener('keydown', e => {
      if (!resultsEl.classList.contains('visible')) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        memberSearchIndex = Math.min(memberSearchIndex + 1, memberSearchResults.length - 1);
        updateMemberSearchSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        memberSearchIndex = Math.max(memberSearchIndex - 1, 0);
        updateMemberSearchSelection();
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        if (memberSearchResults.length > 0) {
          e.preventDefault();
          const index = memberSearchIndex >= 0 ? memberSearchIndex : 0;
          selectMemberSearchResult(memberSearchResults[index]);
        }
      } else if (e.key === 'Escape') {
        resultsEl.innerHTML = '';
        resultsEl.classList.remove('visible');
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        resultsEl.classList.remove('visible');
      }, 150);
    });

    input.addEventListener('focus', () => {
      if (memberSearchResults.length > 0 && input.value.trim().length >= 3) {
        resultsEl.classList.add('visible');
      }
    });
  }

  function renderMemberSearchResults(query) {
    const resultsEl = document.getElementById('member-search-results');
    resultsEl.innerHTML = '';

    if (memberSearchResults.length === 0) {
      resultsEl.classList.remove('visible');
      return;
    }

    memberSearchResults.forEach((m, i) => {
      const li = document.createElement('li');
      li.className = 'search-result';
      const displayName = `${m.first_name || ''} ${m.last_name || ''}`.trim();
      li.innerHTML = highlightMatch(displayName, query) + ` <span class="search-result-meta">(${m.party_code}-${m.state_code})</span>`;
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        selectMemberSearchResult(m);
      });
      li.addEventListener('mouseenter', () => {
        memberSearchIndex = i;
        updateMemberSearchSelection();
      });
      resultsEl.appendChild(li);
    });

    resultsEl.classList.add('visible');
  }

  function updateMemberSearchSelection() {
    const resultsEl = document.getElementById('member-search-results');
    const items = resultsEl.querySelectorAll('.search-result');
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === memberSearchIndex);
    });
  }

  function selectMemberSearchResult(member) {
    const input = document.getElementById('member-search');
    const resultsEl = document.getElementById('member-search-results');

    selectMember(membersById.get(member.id) || member);

    input.value = '';
    resultsEl.innerHTML = '';
    resultsEl.classList.remove('visible');
    memberSearchResults = [];
    memberSearchIndex = -1;
  }

  let selectedMemberId = null;

  function clearMemberDetail() {
    selectedMemberId = null;
    const container = document.getElementById('member-detail');
    container.innerHTML = '<p class="placeholder-text">No members to display</p>';
    renderStaffTable(null);
    renderCommitteesTable(null);
    renderOffices(null);
  }

  function selectMember(member) {
    const sameMember = selectedMemberId === member.id;
    selectedMemberId = member.id;

    // Remove existing selection
    document.querySelectorAll('.member-item.selected').forEach(el => {
      el.classList.remove('selected');
    });

    // Find and highlight the member in the list
    const memberItem = document.querySelector(`.member-item[data-id="${member.id}"]`);
    if (memberItem) {
      memberItem.classList.add('selected');
    }

    if (sameMember) return;

    // Render member detail and tab tables
    renderMemberDetail(member);
    renderStaffTable(member.id);
    renderCommitteesTable(member.id);
    renderOffices(member.id);
  }

  function getMemberPhotoUrl(bioguideId) {
    return `https://unitedstates.github.io/images/congress/225x275/${bioguideId}.jpg`;
  }

  function formatPartyLocation(member) {
    if (member.chamber === 'house' && member.district_number) {
      const district = member.is_at_large ? 'At Large' : `District ${member.district_number}`;
      return `${member.party} — ${member.state} ${district}`;
    }
    return `${member.party} — ${member.state}`;
  }

  function renderMemberDetail(member) {
    const container = document.getElementById('member-detail');
    container.classList.add('detail-enter');
    container.innerHTML = '';

    const firstName = member.nickname || member.first_name || '';
    const middleName = member.middle_name ? ` ${member.middle_name}` : '';
    const lastName = member.last_name || '';
    const baseName = `${firstName}${middleName} ${lastName}`.trim();
    const displayName = member.chamber === 'senate'
      ? `Senator ${baseName}`
      : `Rep. ${baseName}`;

    const header = document.createElement('div');
    header.className = 'detail-header';

    if (member.bioguide_id) {
      const photoWrap = document.createElement('div');
      photoWrap.className = 'detail-photo-wrap is-loading';

      const photo = document.createElement('img');
      photo.className = 'detail-photo';
      photo.alt = displayName;

      const onPhotoReady = () => {
        photoWrap.classList.remove('is-loading');
        requestAnimationFrame(() => photo.classList.add('loaded'));
      };

      photo.addEventListener('load', onPhotoReady);
      photo.addEventListener('error', () => {
        photoWrap.remove();
      });

      photo.src = getMemberPhotoUrl(member.bioguide_id);
      if (photo.complete && photo.naturalWidth > 0) {
        onPhotoReady();
      }

      photoWrap.appendChild(photo);
      header.appendChild(photoWrap);
    }

    const info = document.createElement('div');
    info.className = 'detail-info';

    // Name and Bioguide ID
    const nameRow = document.createElement('div');
    nameRow.className = 'detail-name-row';

    const nameEl = document.createElement('h3');
    nameEl.className = 'detail-name';
    nameEl.textContent = displayName;
    nameRow.appendChild(nameEl);

    if (member.bioguide_id) {
      const bioguide = document.createElement('span');
      bioguide.className = 'detail-bioguide';
      bioguide.textContent = `Bioguide ID: ${member.bioguide_id}`;
      nameRow.appendChild(bioguide);
    }

    info.appendChild(nameRow);

    if (member.leadership_title) {
      const leadership = document.createElement('div');
      leadership.className = 'detail-leadership';
      leadership.textContent = member.leadership_title;
      info.appendChild(leadership);
    }

    // Party and State
    const partyState = document.createElement('div');
    partyState.className = 'detail-party-state';
    const partyBadge = document.createElement('span');
    partyBadge.className = `member-party party-${member.party_code}`;
    partyBadge.textContent = member.party_code;
    partyState.appendChild(partyBadge);
    partyState.appendChild(document.createTextNode(` ${formatPartyLocation(member)}`));
    info.appendChild(partyState);

    header.appendChild(info);
    container.appendChild(header);

    requestAnimationFrame(() => {
      container.classList.remove('detail-enter');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadCommittees();
    loadMembers();
    setupSearch();
    setupMemberSearch();
    setupMemberTabs();
    document.getElementById('committee-clear')?.addEventListener('click', clearCommitteeSelection);
  });

  // ===================
  // Resizable Panels
  // ===================

  const panels = document.getElementById('panels');
  const handles = document.querySelectorAll('.resize-handle');

  let activeHandle = null;
  let startX = 0;
  let startWidths = [];

  function getColumnWidths() {
    const cols = getComputedStyle(panels).gridTemplateColumns.split(' ');
    return cols.map(w => parseFloat(w));
  }

  function setColumnWidths(widths) {
    const template = widths.map((w, i) => (i % 2 === 1 ? '4px' : `${w}px`)).join(' ');
    panels.style.gridTemplateColumns = template;
  }

  handles.forEach(handle => {
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      activeHandle = handle;
      startX = e.clientX;
      startWidths = getColumnWidths();
      document.body.classList.add('resizing');
      handle.classList.add('active');
    });
  });

  document.addEventListener('mousemove', e => {
    if (!activeHandle) return;

    const delta = e.clientX - startX;
    const index = parseInt(activeHandle.dataset.resize, 10);
    const leftCol = index * 2;
    const rightCol = leftCol + 2;

    const newWidths = [...startWidths];
    const minWidth = 100;

    let newLeft = startWidths[leftCol] + delta;
    let newRight = startWidths[rightCol] - delta;

    if (newLeft < minWidth) {
      newLeft = minWidth;
      newRight = startWidths[leftCol] + startWidths[rightCol] - minWidth;
    }
    if (newRight < minWidth) {
      newRight = minWidth;
      newLeft = startWidths[leftCol] + startWidths[rightCol] - minWidth;
    }

    newWidths[leftCol] = newLeft;
    newWidths[rightCol] = newRight;

    setColumnWidths(newWidths);
  });

  document.addEventListener('mouseup', () => {
    if (activeHandle) {
      document.body.classList.remove('resizing');
      activeHandle.classList.remove('active');
      activeHandle = null;
    }
  });
})();
